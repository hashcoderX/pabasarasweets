'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type StockType = 'raw_material' | 'finished_good';
type StockStatus = 'active' | 'inactive';

type InventoryRow = {
  id: number;
  code?: string;
  name?: string;
  category?: string;
  type?: StockType;
  unit?: string;
  current_stock?: number;
  minimum_stock?: number;
  maximum_stock?: number;
  unit_price?: number;
  status?: StockStatus;
  supplier_name?: string;
  location?: string;
};

type Paginated<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function FullStockReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | StockType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | StockStatus>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
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
          ...(Array.isArray(userData?.roles) ? userData.roles.map((role: any) => String(role?.name || role || '')) : []),
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
        const isAdminUser = !employeeId || roleBlob.includes('super admin') || roleBlob.includes('superadmin') || roleBlob.includes('administrator') || roleBlob.includes('admin');
        const hasReportPermission = permissionNames.some((permission: string) => permission.includes('report'));

        if (!isAdminUser && !hasReportPermission) {
          router.push('/dashboard');
          return;
        }

        await fetchRows(token);
      } catch (error) {
        console.error('Error checking full stock report access:', error);
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

      const allRows: InventoryRow[] = [];
      let nextUrl: string | null = `${API_URL}/api/stock/inventory?per_page=200`;
      let pageCount = 0;

      while (nextUrl && pageCount < 50) {
        const response: { data: { data?: Paginated<InventoryRow> } } = await axios.get(nextUrl, {
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
      console.error('Error loading stock report:', error);
      setRows([]);
      setErrorMessage('Failed to load stock report data.');
    } finally {
      setLoading(false);
    }
  };

  const isLowStock = (row: InventoryRow) => Number(row.current_stock || 0) <= Number(row.minimum_stock || 0);
  const isOutOfStock = (row: InventoryRow) => Number(row.current_stock || 0) <= 0;

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.type !== typeFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (stockFilter === 'low' && !isLowStock(row)) return false;
      if (stockFilter === 'out' && !isOutOfStock(row)) return false;

      if (!term) return true;

      const text = [row.code, row.name, row.category, row.supplier_name, row.location]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');

      return text.includes(term);
    });
  }, [rows, search, typeFilter, statusFilter, stockFilter]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const raw = filteredRows.filter((r) => r.type === 'raw_material').length;
    const finished = filteredRows.filter((r) => r.type === 'finished_good').length;
    const low = filteredRows.filter((r) => isLowStock(r)).length;
    const out = filteredRows.filter((r) => isOutOfStock(r)).length;

    return { total, raw, finished, low, out };
  }, [filteredRows]);

  const formatQty = (value?: number) => Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toType = (value?: string) => (value ? value.replace('_', ' ').toUpperCase() : '-');

  const rowToExport = (row: InventoryRow) => [
    row.code || '-',
    row.name || '-',
    toType(row.type),
    row.category || '-',
    formatQty(row.current_stock),
    formatQty(row.minimum_stock),
    formatQty(row.maximum_stock),
    row.unit || '-',
    row.status ? row.status.toUpperCase() : '-',
  ];

  const exportCsv = () => {
    const headers = ['Code', 'Item Name', 'Type', 'Category', 'Current Stock', 'Min Stock', 'Max Stock', 'Unit', 'Status'];
    const csvContent = [headers, ...filteredRows.map(rowToExport)]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `full-stock-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Full Stock Report', 40, 40);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);

    autoTable(doc, {
      startY: 74,
      head: [['Code', 'Item Name', 'Type', 'Category', 'Current', 'Min', 'Max', 'Unit', 'Status']],
      body: filteredRows.map(rowToExport),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [234, 88, 12] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(`Summary - Total: ${summary.total}, Raw: ${summary.raw}, Finished: ${summary.finished}, Low: ${summary.low}, Out: ${summary.out}`, 20, doc.internal.pageSize.getHeight() - 20);
      },
    });

    return doc;
  };

  const viewPdf = () => window.open(buildPdf().output('bloburl'), '_blank');
  const downloadPdf = () => buildPdf().save(`full-stock-report-${new Date().toISOString().split('T')[0]}.pdf`);

  if (!token || !accessReady) {
    return <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-red-50 relative overflow-hidden">
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard/reports" className="flex items-center space-x-2 text-black hover:text-orange-600 transition-colors"><span>Back to Reports</span></Link>
          <span className="text-sm text-black hidden md:block">Full Stock Report Ready</span>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-black mb-2">Full <span className="bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Stock Report</span></h1>
          <p className="text-black">Overall stock report by type, category, and stock health.</p>
        </div>

        {errorMessage && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, item, category" className="md:col-span-2 rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="rounded-md border border-gray-300 text-sm text-black px-2 py-2">
              <option value="all">All Types</option>
              <option value="raw_material">Raw Material</option>
              <option value="finished_good">Finished Good</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="rounded-md border border-gray-300 text-sm text-black px-2 py-2">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as any)} className="rounded-md border border-gray-300 text-sm text-black px-2 py-2">
              <option value="all">All Stock Levels</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>
            <button onClick={() => fetchRows()} disabled={loading} className="md:col-span-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 rounded-md text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Loading...' : 'Refresh Data'}</button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={viewPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700">View PDF</button>
            <button onClick={downloadPdf} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700">Download PDF</button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-orange-200 bg-orange-50 text-orange-700">Download CSV (Excel)</button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/95 shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-orange-50 flex flex-wrap gap-3 text-sm text-black">
            <span>Total: <strong>{summary.total}</strong></span>
            <span>Raw: <strong>{summary.raw}</strong></span>
            <span>Finished: <strong>{summary.finished}</strong></span>
            <span>Low: <strong>{summary.low}</strong></span>
            <span>Out: <strong>{summary.out}</strong></span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50"><tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Current</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Min</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Max</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Status</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-black">No stock items found.</td></tr> : filteredRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                    <td className="px-4 py-3 text-sm text-black">{row.code || '-'}</td>
                    <td className="px-4 py-3 text-sm text-black font-medium">{row.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-black">{toType(row.type)}</td>
                    <td className="px-4 py-3 text-sm text-black">{row.category || '-'}</td>
                    <td className="px-4 py-3 text-sm text-black text-right">{formatQty(row.current_stock)}</td>
                    <td className="px-4 py-3 text-sm text-black text-right">{formatQty(row.minimum_stock)}</td>
                    <td className="px-4 py-3 text-sm text-black text-right">{formatQty(row.maximum_stock)}</td>
                    <td className="px-4 py-3 text-sm text-black">{row.status ? row.status.toUpperCase() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
