'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type LoadStatus = 'pending' | 'in_transit' | 'delivered' | 'cancelled';

type RefVehicle = {
  id: number;
  registration_number?: string;
  type?: string;
};

type RefRoute = {
  id: number;
  name?: string;
  origin?: string;
  destination?: string;
};

type LoadRow = {
  id: number;
  load_number?: string;
  status?: LoadStatus;
  load_date?: string;
  vehicle?: RefVehicle;
  route?: RefRoute;
};

type LoadItemRow = {
  id: number;
  load_id: number;
  product_code?: string;
  name?: string;
  type?: 'finished_product' | 'raw_material';
  out_price?: number;
  sell_price?: number;
  qty?: number;
};

type CompanyBrand = {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
};

type ValuationRow = {
  load_id: number;
  load_number: string;
  load_date: string;
  status: string;
  vehicle: string;
  route: string;
  item_count: number;
  total_qty: number;
  out_value: number;
  sell_value: number;
  expected_profit: number;
};

export default function VehicleLoadingValuationReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ValuationRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LoadStatus>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [companyBrand, setCompanyBrand] = useState<CompanyBrand | null>(null);

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

        if (!isAdminUser && !hasReportPermission) {
          router.push('/dashboard');
          return;
        }

        await Promise.all([fetchCompanyBrand(token), fetchRows(token)]);
      } catch (error) {
        console.error('Error checking vehicle valuation report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchCompanyBrand = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      const companyRes = await axios.get(`${API_URL}/api/companies`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });

      const companyRows = Array.isArray(companyRes.data)
        ? companyRes.data
        : Array.isArray(companyRes.data?.data)
          ? companyRes.data.data
          : [];

      setCompanyBrand(companyRows.length > 0 ? companyRows[0] : null);
    } catch {
      setCompanyBrand(null);
    }
  };

  const fetchRows = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const loadsRes = await axios.get(`${API_URL}/api/vehicle-loading/loads`, {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });

      const loadsData = Array.isArray(loadsRes.data) ? (loadsRes.data as LoadRow[]) : [];

      const valuationRows = await Promise.all(
        loadsData.map(async (load) => {
          try {
            const itemsRes = await axios.get(`${API_URL}/api/vehicle-loading/load-items`, {
              headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
              params: { load_id: load.id },
            });

            const items = Array.isArray(itemsRes.data) ? (itemsRes.data as LoadItemRow[]) : [];
            const totalQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
            const outValue = items.reduce(
              (sum, item) => sum + Number(item.qty || 0) * Number(item.out_price || 0),
              0
            );
            const sellValue = items.reduce(
              (sum, item) => sum + Number(item.qty || 0) * Number(item.sell_price || 0),
              0
            );

            return {
              load_id: load.id,
              load_number: load.load_number || '-',
              load_date: load.load_date || '-',
              status: load.status || '-',
              vehicle: load.vehicle?.registration_number || '-',
              route: load.route?.name || `${load.route?.origin || '-'} -> ${load.route?.destination || '-'}`,
              item_count: items.length,
              total_qty: totalQty,
              out_value: outValue,
              sell_value: sellValue,
              expected_profit: sellValue - outValue,
            } as ValuationRow;
          } catch {
            return {
              load_id: load.id,
              load_number: load.load_number || '-',
              load_date: load.load_date || '-',
              status: load.status || '-',
              vehicle: load.vehicle?.registration_number || '-',
              route: load.route?.name || `${load.route?.origin || '-'} -> ${load.route?.destination || '-'}`,
              item_count: 0,
              total_qty: 0,
              out_value: 0,
              sell_value: 0,
              expected_profit: 0,
            } as ValuationRow;
          }
        })
      );

      setRows(valuationRows);
    } catch (error) {
      console.error('Error fetching vehicle valuation report rows:', error);
      setRows([]);
      setErrorMessage('Failed to load vehicle loading valuation report data.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;

      if (startDate || endDate) {
        const d = row.load_date ? new Date(`${row.load_date}T00:00:00`) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (startDate && d < new Date(`${startDate}T00:00:00`)) return false;
        if (endDate && d > new Date(`${endDate}T23:59:59`)) return false;
      }

      if (!term) return true;

      const text = [row.load_number, row.vehicle, row.route, row.status]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return text.includes(term);
    });
  }, [rows, search, statusFilter, startDate, endDate]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const totalQty = filteredRows.reduce((sum, row) => sum + Number(row.total_qty || 0), 0);
    const outValue = filteredRows.reduce((sum, row) => sum + Number(row.out_value || 0), 0);
    const sellValue = filteredRows.reduce((sum, row) => sum + Number(row.sell_value || 0), 0);
    const expectedProfit = filteredRows.reduce((sum, row) => sum + Number(row.expected_profit || 0), 0);

    return { total, totalQty, outValue, sellValue, expectedProfit };
  }, [filteredRows]);

  const toDateLabel = (value?: string | null) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const toStatusLabel = (value?: string) => {
    return value ? value.replace('_', ' ').toUpperCase() : '-';
  };

  const formatMoney = (value?: number) => {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const rowToExport = (row: ValuationRow) => {
    return [
      row.load_number,
      toDateLabel(row.load_date),
      row.vehicle,
      row.route,
      toStatusLabel(row.status),
      String(row.item_count),
      String(Number(row.total_qty || 0).toFixed(2)),
      formatMoney(row.out_value),
      formatMoney(row.sell_value),
      formatMoney(row.expected_profit),
    ];
  };

  const exportCsv = () => {
    const headers = [
      'Load Number',
      'Load Date',
      'Vehicle',
      'Route',
      'Status',
      'Item Count',
      'Total Qty',
      'Out Value',
      'Sell Value',
      'Expected Profit',
    ];

    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vehicle-loading-valuation-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    const companyName = companyBrand?.name?.trim() || 'Company';
    const companyMeta = [companyBrand?.address, companyBrand?.phone, companyBrand?.email, companyBrand?.website]
      .filter(Boolean)
      .join(' | ');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(companyName, 40, 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (companyMeta) {
      doc.text(companyMeta, 40, 44);
    }

    doc.setDrawColor(180);
    doc.line(40, 52, doc.internal.pageSize.getWidth() - 40, 52);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Vehicle Loading Full Valuation Report', 40, 72);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 90);
    doc.text(`Date Range: ${startDate || '-'} to ${endDate || '-'}`, 40, 104);
    doc.text(`Status Filter: ${statusFilter === 'all' ? 'ALL' : toStatusLabel(statusFilter)}`, 40, 118);

    autoTable(doc, {
      startY: 132,
      head: [[
        'Load No',
        'Load Date',
        'Vehicle',
        'Route',
        'Status',
        'Items',
        'Qty',
        'Out Value',
        'Sell Value',
        'Profit',
      ]],
      body: filteredRows.map(rowToExport),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [124, 58, 237] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(
          `Summary - Total: ${summary.total}, Qty: ${summary.totalQty.toFixed(2)}, Out: ${formatMoney(summary.outValue)}, Sell: ${formatMoney(summary.sellValue)}, Profit: ${formatMoney(summary.expectedProfit)}`,
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
    doc.save(`vehicle-loading-valuation-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-violet-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 sm:py-0 gap-3 sm:gap-0">
            <div className="flex items-center justify-between sm:justify-start">
              <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-violet-600 transition-colors duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium">Back to Reports</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Vehicle Loading Full Valuation Report Ready</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Vehicle Loading Full <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Valuation Report</span>
          </h1>
          <p className="text-gray-600">Analyze per-load cost, selling value, and expected gross profit.</p>
          {companyBrand?.name && (
            <p className="text-xs text-gray-600 mt-2">Branded for {companyBrand.name}</p>
          )}
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
                placeholder="Load no, vehicle, route"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | LoadStatus)}
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
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => fetchRows()}
                disabled={loading}
                className="w-full px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60"
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
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-indigo-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total Loads: <strong>{summary.total}</strong></span>
            <span>Total Qty: <strong>{summary.totalQty.toFixed(2)}</strong></span>
            <span>Out Value: <strong>{formatMoney(summary.outValue)}</strong></span>
            <span>Sell Value: <strong>{formatMoney(summary.sellValue)}</strong></span>
            <span>Expected Profit: <strong>{formatMoney(summary.expectedProfit)}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Load No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Load Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Vehicle</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Route</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Items</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Out Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Sell Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Profit</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">No valuation records found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row, idx) => (
                    <tr key={row.load_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.load_number}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{toDateLabel(row.load_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{row.vehicle}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.route}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                          row.status === 'delivered'
                            ? 'bg-green-100 text-green-700'
                            : row.status === 'in_transit'
                              ? 'bg-blue-100 text-blue-700'
                              : row.status === 'cancelled'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {toStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{row.item_count}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.total_qty).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 text-right">{formatMoney(row.out_value)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold text-right">{formatMoney(row.sell_value)}</td>
                      <td className={`px-4 py-3 text-sm text-right font-semibold ${row.expected_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatMoney(row.expected_profit)}
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
