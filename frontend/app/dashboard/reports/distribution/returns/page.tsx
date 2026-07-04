'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReturnStatus = 'pending' | 'approved' | 'rejected';
type SettlementType = 'bill_deduction' | 'cash_refund' | 'item_exchange';

type CustomerInfo = {
  id: number;
  shop_name?: string;
  customer_code?: string;
};

type InvoiceInfo = {
  id: number;
  invoice_number?: string;
};

type InventoryInfo = {
  id: number;
  name?: string;
  code?: string;
  unit?: string;
};

type ReturnRow = {
  id: number;
  return_number?: string;
  distribution_invoice_id?: number | null;
  customer_id?: number;
  customer?: CustomerInfo | null;
  invoice?: InvoiceInfo | null;
  returnedItem?: InventoryInfo | null;
  exchangeItem?: InventoryInfo | null;
  return_date?: string;
  total_quantity?: number;
  total_amount?: number;
  settlement_type?: SettlementType;
  settlement_amount?: number;
  exchange_quantity?: number;
  reason?: string;
  status?: ReturnStatus;
  notes?: string;
};

type PaginatedResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function DistributionReturnsReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReturnStatus>('all');
  const [settlementFilter, setSettlementFilter] = useState<'all' | SettlementType>('all');
  const [customerFilter, setCustomerFilter] = useState('all');
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
        console.error('Error checking returns report access:', error);
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

      const allRows: ReturnRow[] = [];
      let nextUrl: string | null = `${API_URL}/api/distribution/returns?per_page=200`;
      let pageCount = 0;

      while (nextUrl && pageCount < 50) {
        const response: { data: { data?: PaginatedResponse<ReturnRow> } } = await axios.get(nextUrl, {
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
      console.error('Error fetching returns report rows:', error);
      setRows([]);
      setErrorMessage('Failed to load returns report data.');
    } finally {
      setLoading(false);
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

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (settlementFilter !== 'all' && row.settlement_type !== settlementFilter) return false;
      if (customerFilter !== 'all' && String(row.customer?.shop_name || '') !== customerFilter) return false;

      if (fromDate) {
        const d = row.return_date ? new Date(row.return_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d < new Date(fromDate)) return false;
      }

      if (toDate) {
        const d = row.return_date ? new Date(row.return_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d > new Date(toDate + 'T23:59:59')) return false;
      }

      if (!term) return true;

      const text = [
        row.return_number,
        row.customer?.shop_name,
        row.customer?.customer_code,
        row.invoice?.invoice_number,
        row.returnedItem?.name,
        row.returnedItem?.code,
        row.exchangeItem?.name,
        row.status,
        row.settlement_type,
        row.reason,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return text.includes(term);
    });
  }, [rows, search, statusFilter, settlementFilter, customerFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalReturns = filteredRows.length;
    const totalQuantity = filteredRows.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0);
    const totalAmount = filteredRows.reduce((sum, row) => sum + parseAmount(row.total_amount), 0);
    const settlementAmount = filteredRows.reduce((sum, row) => sum + parseAmount(row.settlement_amount), 0);

    const settlementTotals = {
      bill_deduction: filteredRows
        .filter((row) => row.settlement_type === 'bill_deduction')
        .reduce((sum, row) => sum + parseAmount(row.settlement_amount), 0),
      cash_refund: filteredRows
        .filter((row) => row.settlement_type === 'cash_refund')
        .reduce((sum, row) => sum + parseAmount(row.settlement_amount), 0),
      item_exchange: filteredRows
        .filter((row) => row.settlement_type === 'item_exchange')
        .reduce((sum, row) => sum + parseAmount(row.settlement_amount), 0),
    };

    const statusCounts = {
      pending: filteredRows.filter((row) => row.status === 'pending').length,
      approved: filteredRows.filter((row) => row.status === 'approved').length,
      rejected: filteredRows.filter((row) => row.status === 'rejected').length,
    };

    return {
      totalReturns,
      totalQuantity,
      totalAmount,
      settlementAmount,
      settlementTotals,
      statusCounts,
    };
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

  const settlementLabel = (value?: SettlementType) => {
    if (value === 'cash_refund') return 'Cash Refund';
    if (value === 'item_exchange') return 'Item Exchange';
    return 'Bill Deduction';
  };

  const settlementBadgeClass = (value?: SettlementType) => {
    if (value === 'cash_refund') return 'bg-blue-100 text-blue-700';
    if (value === 'item_exchange') return 'bg-purple-100 text-purple-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const statusBadgeClass = (status?: ReturnStatus) => {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-700';
    if (status === 'pending') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  const rowToExport = (row: ReturnRow) => {
    return [
      row.return_number || '-',
      row.invoice?.invoice_number || '-',
      row.customer?.customer_code || '-',
      row.customer?.shop_name || '-',
      toDateLabel(row.return_date),
      row.returnedItem ? `${row.returnedItem.code || '-'} - ${row.returnedItem.name || '-'}` : '-',
      Number(row.total_quantity || 0).toFixed(2),
      formatMoney(row.total_amount),
      settlementLabel(row.settlement_type),
      formatMoney(row.settlement_amount),
      row.exchangeItem ? `${row.exchangeItem.code || '-'} - ${row.exchangeItem.name || '-'}` : '-',
      Number(row.exchange_quantity || 0).toFixed(2),
      row.status ? row.status.toUpperCase() : '-',
      row.reason || '-',
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Return Number',
      'Invoice Number',
      'Customer Code',
      'Customer Name',
      'Return Date',
      'Returned Item',
      'Return Qty',
      'Return Amount',
      'Settlement Type',
      'Settlement Amount',
      'Exchange Item',
      'Exchange Qty',
      'Status',
      'Reason',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `distribution-returns-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Distribution Returns Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'ALL' : statusFilter.toUpperCase()}`, 40, 72);
    doc.text(`Settlement Filter: ${settlementFilter === 'all' ? 'ALL' : settlementLabel(settlementFilter)}`, 40, 86);

    autoTable(doc, {
      startY: 100,
      head: [[
        'Return #',
        'Invoice #',
        'Customer',
        'Date',
        'Returned Item',
        'Qty',
        'Amount',
        'Settlement',
        'Settle Amount',
        'Status',
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
          values[12],
        ];
      }),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [22, 163, 74] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Returns: ${summary.totalReturns} | Return Amount: ${formatMoney(summary.totalAmount)} | Settlement Amount: ${formatMoney(summary.settlementAmount)} | Bill Deduction: ${formatMoney(summary.settlementTotals.bill_deduction)} | Cash Refund: ${formatMoney(summary.settlementTotals.cash_refund)} | Item Exchange: ${formatMoney(summary.settlementTotals.item_exchange)}`,
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
    doc.save(`distribution-returns-report-${new Date().toISOString().split('T')[0]}.pdf`);
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
              <span>Returns Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Returns <span className="bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">Report</span>
          </h1>
          <p className="text-gray-600">Distribution returns by item, settlement mode, customer, and status.</p>
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
                placeholder="Return no, invoice, customer, item"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | ReturnStatus)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Settlement</label>
              <select
                value={settlementFilter}
                onChange={(e) => setSettlementFilter(e.target.value as 'all' | SettlementType)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                <option value="bill_deduction">Bill Deduction</option>
                <option value="cash_refund">Cash Refund</option>
                <option value="item_exchange">Item Exchange</option>
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

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-50 to-teal-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total Returns: <strong>{summary.totalReturns}</strong></span>
            <span>Total Qty: <strong>{summary.totalQuantity.toFixed(2)}</strong></span>
            <span>Return Amount: <strong>{formatMoney(summary.totalAmount)}</strong></span>
            <span>Settlement Amount: <strong>{formatMoney(summary.settlementAmount)}</strong></span>
            <span>Bill Deduction: <strong>{formatMoney(summary.settlementTotals.bill_deduction)}</strong></span>
            <span>Cash Refund: <strong>{formatMoney(summary.settlementTotals.cash_refund)}</strong></span>
            <span>Item Exchange: <strong>{formatMoney(summary.settlementTotals.item_exchange)}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Return #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Returned Item</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Return Amt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Settlement</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Settle Amt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Exchange Item</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Exch. Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-sm text-gray-500">No returns records found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.return_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.invoice?.invoice_number || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                        {(row.customer?.customer_code || '-') + ' - ' + (row.customer?.shop_name || '-')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.return_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {row.returnedItem ? `${row.returnedItem.code || '-'} - ${row.returnedItem.name || '-'}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{Number(row.total_quantity || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatMoney(row.total_amount)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${settlementBadgeClass(row.settlement_type)}`}>
                          {settlementLabel(row.settlement_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatMoney(row.settlement_amount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {row.exchangeItem ? `${row.exchangeItem.code || '-'} - ${row.exchangeItem.name || '-'}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{Number(row.exchange_quantity || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                          {row.status ? row.status.toUpperCase() : '-'}
                        </span>
                      </td>
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
