'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type InvoiceStatus = 'pending' | 'partial' | 'paid' | 'cancelled';

type InvoiceItem = {
  id: number;
  item_code?: string;
  item_name?: string;
  quantity?: number;
  unit_price?: number;
  discount?: number;
};

type InvoiceRow = {
  id: number;
  invoice_number?: string;
  invoice_date?: string;
  load_id?: number | null;
  status?: InvoiceStatus;
  items?: InvoiceItem[];
};

type LoadRow = {
  id: number;
  load_number?: string;
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

type DiscountSummaryRow = {
  itemCode: string;
  itemName: string;
  discountPercent: number;
  totalSoldQty: number;
  invoiceCount: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export default function DistributionDiscountReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [search, setSearch] = useState('');
  const [discountFilter, setDiscountFilter] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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

        await fetchRows(token);
      } catch (error) {
        console.error('Error checking discount report access:', error);
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

      const allRows: InvoiceRow[] = [];
      let nextUrl: string | null = `${API_URL}/api/distribution/invoices?per_page=200`;
      let pageCount = 0;

      while (nextUrl && pageCount < 50) {
        const response: { data: { data?: PaginatedResponse<InvoiceRow> } } = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        });

        const payload = response.data?.data;
        const pageRows = Array.isArray(payload?.data) ? payload.data : [];
        allRows.push(...pageRows);

        nextUrl = payload?.next_page_url || null;
        pageCount += 1;
      }

      setInvoices(allRows);

      const loadRows = await axios
        .get(`${API_URL}/api/vehicle-loading/loads`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        })
        .then((res) => (Array.isArray(res.data) ? (res.data as LoadRow[]) : []));
      setLoads(loadRows);
    } catch (error) {
      console.error('Error fetching discount report rows:', error);
      setInvoices([]);
      setLoads([]);
      setErrorMessage('Failed to load discount report data.');
    } finally {
      setLoading(false);
    }
  };

  const loadById = useMemo(() => {
    const map = new Map<number, LoadRow>();
    loads.forEach((load) => map.set(Number(load.id), load));
    return map;
  }, [loads]);

  const deliveryOptions = useMemo(() => {
    const map = new Map<string, string>();

    invoices.forEach((invoice) => {
      const loadId = Number(invoice.load_id || 0);
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

  const getItemDiscountPercent = (item: InvoiceItem) => {
    const effectiveUnitPrice = Number(item.unit_price || 0);
    const itemDiscount = Math.max(0, Number(item.discount || 0));
    const baseUnitPrice = effectiveUnitPrice + itemDiscount;

    if (baseUnitPrice <= 0 || itemDiscount <= 0) return 0;
    return round2((itemDiscount / baseUnitPrice) * 100);
  };

  const dateFilteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (String(invoice.status || '').toLowerCase() === 'cancelled') return false;

      if (deliveryFilter !== 'all') {
        if (Number(invoice.load_id || 0) !== Number(deliveryFilter)) return false;
      }

      if (fromDate) {
        const d = invoice.invoice_date ? new Date(invoice.invoice_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d < new Date(fromDate)) return false;
      }

      if (toDate) {
        const d = invoice.invoice_date ? new Date(invoice.invoice_date) : null;
        if (!d || Number.isNaN(d.getTime()) || d > new Date(`${toDate}T23:59:59`)) return false;
      }

      return true;
    });
  }, [invoices, deliveryFilter, fromDate, toDate]);

  const aggregateRows = useMemo(() => {
    const map = new Map<string, DiscountSummaryRow & { invoiceIds: Set<number> }>();

    dateFilteredInvoices.forEach((invoice) => {
      (invoice.items || []).forEach((item) => {
        const qty = Number(item.quantity || 0);
        if (qty <= 0) return;

        const itemCode = String(item.item_code || '-').trim() || '-';
        const itemName = String(item.item_name || 'Unknown Item').trim() || 'Unknown Item';
        const discountPercent = getItemDiscountPercent(item);
        const key = `${itemCode}__${itemName}__${discountPercent.toFixed(2)}`;

        const existing = map.get(key);
        if (existing) {
          existing.totalSoldQty += qty;
          existing.invoiceIds.add(invoice.id);
          return;
        }

        map.set(key, {
          itemCode,
          itemName,
          discountPercent,
          totalSoldQty: qty,
          invoiceCount: 0,
          invoiceIds: new Set([invoice.id]),
        });
      });
    });

    return Array.from(map.values())
      .map((row) => ({
        itemCode: row.itemCode,
        itemName: row.itemName,
        discountPercent: row.discountPercent,
        totalSoldQty: round2(row.totalSoldQty),
        invoiceCount: row.invoiceIds.size,
      }))
      .sort((a, b) => {
        if (b.totalSoldQty !== a.totalSoldQty) return b.totalSoldQty - a.totalSoldQty;
        if (b.discountPercent !== a.discountPercent) return b.discountPercent - a.discountPercent;
        return a.itemName.localeCompare(b.itemName);
      });
  }, [dateFilteredInvoices]);

  const discountOptions = useMemo(() => {
    return Array.from(new Set(aggregateRows.map((row) => row.discountPercent.toFixed(2))))
      .map((value) => Number(value))
      .sort((a, b) => a - b);
  }, [aggregateRows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return aggregateRows.filter((row) => {
      if (discountFilter !== 'all' && row.discountPercent.toFixed(2) !== Number(discountFilter).toFixed(2)) {
        return false;
      }

      if (!term) return true;

      const haystack = `${row.itemCode} ${row.itemName} ${row.discountPercent}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [aggregateRows, search, discountFilter]);

  const summary = useMemo(() => {
    const uniqueItems = new Set(filteredRows.map((row) => `${row.itemCode}__${row.itemName}`)).size;
    const totalRows = filteredRows.length;
    const totalSoldQty = round2(filteredRows.reduce((sum, row) => sum + row.totalSoldQty, 0));

    return {
      uniqueItems,
      totalRows,
      totalSoldQty,
    };
  }, [filteredRows]);

  const formatPercent = (value: number) => {
    const n = round2(value);
    return Number.isInteger(n) ? `${n.toFixed(0)}%` : `${n.toFixed(2)}%`;
  };

  const formatQty = (value: number) => {
    const n = round2(value);
    return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2);
  };

  const rowToExport = (row: DiscountSummaryRow) => {
    return [
      row.itemCode,
      row.itemName,
      formatPercent(row.discountPercent),
      formatQty(row.totalSoldQty),
      String(row.invoiceCount),
    ];
  };

  const exportCsv = () => {
    const headers = ['Item Code', 'Item Name', 'Discount %', 'Total Sold Qty', 'Invoice Count'];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `distribution-discount-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFontSize(16);
    doc.text('Distribution Discount Report', 40, 40);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);
    doc.text(`Discount Filter: ${discountFilter === 'all' ? 'ALL' : formatPercent(Number(discountFilter))}`, 40, 72);

    autoTable(doc, {
      startY: 90,
      head: [['Item Code', 'Item', 'Discount %', 'Total Sold Qty', 'Invoice Count']],
      body: filteredRows.map((row) => rowToExport(row)),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [5, 150, 105] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Rows: ${summary.totalRows} | Unique Items: ${summary.uniqueItems} | Total Sold Qty: ${formatQty(summary.totalSoldQty)}`,
          20,
          doc.internal.pageSize.getHeight() - 20
        );
      },
    });

    doc.save(`distribution-discount-report-${new Date().toISOString().split('T')[0]}.pdf`);
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
              <span>Discount Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Distribution <span className="bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">Discount Report</span>
          </h1>
          <p className="text-gray-600">Preview sold items and quantity totals grouped by discount percentage.</p>
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
                placeholder="Item code, item name, discount"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Discount %</label>
              <select
                value={discountFilter}
                onChange={(e) => setDiscountFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {discountOptions.map((discountValue) => (
                  <option key={discountValue.toFixed(2)} value={discountValue.toFixed(2)}>
                    {formatPercent(discountValue)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery</label>
              <select
                value={deliveryFilter}
                onChange={(e) => setDeliveryFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="all">All</option>
                {deliveryOptions.map((deliveryOption) => (
                  <option key={deliveryOption.id} value={deliveryOption.id}>{deliveryOption.label}</option>
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
            <button
              type="button"
              onClick={downloadPdf}
              className="px-4 py-2 rounded-md text-sm font-medium border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              Download CSV (Excel)
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-green-50 to-teal-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Rows: <strong>{summary.totalRows}</strong></span>
            <span>Unique Items: <strong>{summary.uniqueItems}</strong></span>
            <span>Total Sold Qty: <strong>{formatQty(summary.totalSoldQty)}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Item Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Item</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Discount %</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Total Sold Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Invoice Count</th>
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">No discount-based item sales found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={`${row.itemCode}-${row.itemName}-${row.discountPercent}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.itemCode}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.itemName}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{formatPercent(row.discountPercent)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-semibold">{formatQty(row.totalSoldQty)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">{row.invoiceCount}</td>
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
