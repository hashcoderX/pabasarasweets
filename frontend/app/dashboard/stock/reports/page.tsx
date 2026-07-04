'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface InventoryItem {
  id: number;
  name: string;
  code: string;
  type: 'raw_material' | 'finished_good';
  category: string | null;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  maximum_stock: number | null;
  unit_price: number;
  purchase_price?: number | null;
  sell_price?: number | null;
  supplier_name?: string | null;
  location?: string | null;
  status: 'active' | 'inactive';
  updated_at: string;
}

type StockStateFilter = 'all' | 'out_of_stock' | 'low_stock' | 'healthy_stock' | 'over_stock';

export default function StockReports() {
  const [token, setToken] = useState('');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [storeType, setStoreType] = useState<'all' | 'raw_material' | 'finished_good'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [stockStateFilter, setStockStateFilter] = useState<StockStateFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (token) {
      fetchReportData();
    }
  }, [token]);

  const toSafeNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const resolvePrice = (item: Partial<InventoryItem>): number => {
    const unitPrice = toSafeNumber(item.unit_price);
    const purchasePrice = toSafeNumber(item.purchase_price);
    const sellPrice = toSafeNumber(item.sell_price);

    if (unitPrice > 0) return unitPrice;
    if (purchasePrice > 0) return purchasePrice;
    if (sellPrice > 0) return sellPrice;
    return unitPrice || purchasePrice || sellPrice || 0;
  };

  const getStockStatus = (item: InventoryItem) => {
    if (item.current_stock <= 0) {
      return { key: 'out_of_stock' as const, label: 'Out of Stock', color: 'bg-red-100 text-red-700 border-red-200' };
    }
    if (item.current_stock <= item.minimum_stock) {
      return { key: 'low_stock' as const, label: 'Low Stock', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    }
    if (item.maximum_stock && item.current_stock > item.maximum_stock) {
      return { key: 'over_stock' as const, label: 'Overstock', color: 'bg-blue-100 text-blue-700 border-blue-200' };
    }
    return { key: 'healthy_stock' as const, label: 'Healthy', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  };

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/stock/inventory', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 2000 }
      });

      if (response.data.success) {
        const rows = response.data.data?.data || response.data.data || [];
        const normalized = rows.map((item: any) => ({
          ...item,
          current_stock: toSafeNumber(item.current_stock),
          minimum_stock: toSafeNumber(item.minimum_stock),
          maximum_stock: item.maximum_stock !== null ? toSafeNumber(item.maximum_stock) : null,
          unit_price: toSafeNumber(item.unit_price),
          purchase_price: item.purchase_price !== null ? toSafeNumber(item.purchase_price) : null,
          sell_price: item.sell_price !== null ? toSafeNumber(item.sell_price) : null,
        }));
        setItems(normalized);
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error('Error loading stock report data:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch =
      !keyword ||
      item.name.toLowerCase().includes(keyword) ||
      String(item.code || '').toLowerCase().includes(keyword) ||
      String(item.category || '').toLowerCase().includes(keyword) ||
      String(item.supplier_name || '').toLowerCase().includes(keyword);

    const matchesType = storeType === 'all' || item.type === storeType;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const itemStockState = getStockStatus(item).key;
    const matchesStock = stockStateFilter === 'all' || itemStockState === stockStateFilter;

    const updatedDate = item.updated_at ? new Date(item.updated_at) : null;
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    const matchesDateFrom = !fromDate || (updatedDate && updatedDate >= fromDate);
    const matchesDateTo = !toDate || (updatedDate && updatedDate <= toDate);

    return matchesSearch && matchesType && matchesStatus && matchesStock && matchesDateFrom && matchesDateTo;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, storeType, statusFilter, stockStateFilter, dateFrom, dateTo]);

  const totalItems = filteredItems.length;
  const lowStockCount = filteredItems.filter((item) => getStockStatus(item).key === 'low_stock').length;
  const outOfStockCount = filteredItems.filter((item) => getStockStatus(item).key === 'out_of_stock').length;
  const reportValue = filteredItems.reduce((sum, item) => sum + (item.current_stock * resolvePrice(item)), 0);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredItems.length);
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  const resetFilters = () => {
    setSearch('');
    setStoreType('all');
    setStatusFilter('all');
    setStockStateFilter('all');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const escapeCsv = (value: unknown): string => {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const downloadCsv = () => {
    const headers = [
      'Item Name',
      'Code',
      'Store Type',
      'Category',
      'Current Stock',
      'Minimum Stock',
      'Maximum Stock',
      'Unit',
      'Unit Price (LKR)',
      'Purchase Price (LKR)',
      'Sell Price (LKR)',
      'Supplier',
      'Location',
      'Status',
      'Stock State',
      'Updated At'
    ];

    const lines = filteredItems.map((item) => [
      item.name,
      item.code,
      item.type === 'raw_material' ? 'Raw Material' : 'Finished Good',
      item.category || 'Uncategorized',
      item.current_stock.toFixed(2),
      item.minimum_stock.toFixed(2),
      (item.maximum_stock ?? 0).toFixed(2),
      item.unit,
      resolvePrice(item).toFixed(2),
      toSafeNumber(item.purchase_price).toFixed(2),
      toSafeNumber(item.sell_price).toFixed(2),
      item.supplier_name || 'N/A',
      item.location || 'N/A',
      item.status,
      getStockStatus(item).label,
      item.updated_at ? new Date(item.updated_at).toLocaleString() : 'N/A',
    ]);

    const csvContent = [headers, ...lines]
      .map((line) => line.map((cell) => escapeCsv(cell)).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const generatedOn = new Date().toLocaleString();

    doc.setFontSize(18);
    doc.text('Stock Report', 40, 40);
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Generated: ${generatedOn}`, 40, 60);
    doc.text(`Rows: ${filteredItems.length}`, 40, 74);

    autoTable(doc, {
      startY: 92,
      head: [[
        'Item', 'Code', 'Type', 'Stock', 'Min', 'Max', 'Unit Price', 'Supplier', 'Status', 'Stock State'
      ]],
      body: filteredItems.map((item) => [
        item.name,
        item.code,
        item.type === 'raw_material' ? 'Raw Material' : 'Finished Good',
        item.current_stock.toFixed(2),
        item.minimum_stock.toFixed(2),
        (item.maximum_stock ?? 0).toFixed(2),
        `LKR ${resolvePrice(item).toFixed(2)}`,
        item.supplier_name || 'N/A',
        item.status,
        getStockStatus(item).label,
      ]),
      styles: {
        fontSize: 9,
        cellPadding: 6,
      },
      headStyles: {
        fillColor: [194, 65, 12],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      margin: { left: 24, right: 24 },
    });

    doc.save(`stock-report-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_25%),linear-gradient(180deg,_#fffaf5_0%,_#fff3e4_100%)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_23%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_26%),linear-gradient(180deg,_#fffaf5_0%,_#fff7ed_42%,_#fff3e4_100%)] p-4 sm:p-6 lg:p-8">
      <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-[0_26px_90px_-45px_rgba(194,65,12,0.5)] backdrop-blur-xl">
        <div className="grid gap-8 px-5 py-6 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:px-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm font-semibold text-orange-700">
              <span className="h-2 w-2 rounded-full bg-orange-500"></span>
              Reporting and analytics workspace
            </div>
            <div>
              <h3 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Stock Reports</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Generate filtered inventory reports and export polished CSV or PDF snapshots for procurement and management review.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={downloadCsv}
                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Download CSV
              </button>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Download PDF
              </button>
              <button
                onClick={fetchReportData}
                className="inline-flex items-center rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-3xl border border-orange-200/70 bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-300/45">
              <p className="text-xs uppercase tracking-[0.24em] text-white/80">Rows in Report</p>
              <p className="mt-2 text-3xl font-bold">{totalItems}</p>
              <p className="mt-2 text-sm text-white/85">Based on your current filters</p>
            </div>
            <div className="rounded-3xl border border-red-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-red-500">Out of Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{outOfStockCount}</p>
              <p className="mt-2 text-sm text-slate-500">Need immediate action</p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-600">Low Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{lowStockCount}</p>
              <p className="mt-2 text-sm text-slate-500">Near reorder point</p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
        <div className="border-b border-orange-100 bg-gradient-to-r from-white via-orange-50/70 to-amber-50/70 px-5 py-4">
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-700">Filter Reports</h4>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Item, code, category, supplier"
              className="mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Store Type</label>
            <select
              value={storeType}
              onChange={(e) => setStoreType(e.target.value as 'all' | 'raw_material' | 'finished_good')}
              className="mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="raw_material">Raw Material</option>
              <option value="finished_good">Finished Good</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Item Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Stock State</label>
            <select
              value={stockStateFilter}
              onChange={(e) => setStockStateFilter(e.target.value as StockStateFilter)}
              className="mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="healthy_stock">Healthy</option>
              <option value="over_stock">Overstock</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Updated From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Updated To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2 lg:col-span-4 xl:col-span-6 flex justify-end">
            <button
              onClick={resetFilters}
              className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
        <div className="border-b border-orange-100 bg-gradient-to-r from-slate-900 via-orange-900 to-amber-800 px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-100">Stock Report Table</h4>
            <p className="text-xs text-amber-100/85">Total Value: LKR {reportValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-9 w-9 animate-spin rounded-full border-b-2 border-orange-600"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-base font-semibold text-slate-700">No records match your report filters</p>
            <p className="mt-2 text-sm text-slate-500">Adjust filter values or reset filters to expand the report set.</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {paginatedItems.map((item) => {
                  const stockMeta = getStockStatus(item);
                  return (
                    <tr key={item.id} className="transition hover:bg-orange-50/40">
                      <td className="px-4 py-3.5 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.code} • {item.category || 'Uncategorized'}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-700">
                        {item.type === 'raw_material' ? 'Raw Material' : 'Finished Good'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-700">
                        <p>{item.current_stock.toFixed(2)} {item.unit}</p>
                        <p className="text-xs text-slate-500">Min: {item.minimum_stock.toFixed(2)}</p>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-slate-900">
                        LKR {resolvePrice(item).toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-700">
                        {item.supplier_name || 'N/A'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${stockMeta.color}`}>
                            {stockMeta.label}
                          </span>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${item.status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
                            {item.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600">
                        {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          <div className="flex flex-col gap-3 border-t border-orange-100 bg-orange-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Showing {filteredItems.length === 0 ? 0 : startIndex + 1} to {endIndex} of {filteredItems.length} records
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rows</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm font-semibold text-slate-700">
                  Page {safeCurrentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}