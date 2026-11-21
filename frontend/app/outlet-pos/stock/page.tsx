'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';
import { useOutletEmbeddedBridge } from '../useOutletEmbeddedBridge';

type StockLine = {
  inventory_item_id: number;
  name: string;
  code: string;
  unit: string;
  sell_price: number;
  transferred_qty: number;
  sold_qty: number;
  available_qty: number;
};

type StockViewMode = 'all' | 'low' | 'critical';

function OutletStockContent() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<StockLine[]>([]);
  const [outletName, setOutletName] = useState('');
  const [outletCode, setOutletCode] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [stockViewMode, setStockViewMode] = useState<StockViewMode>('all');
  const [lowStockThresholdInput, setLowStockThresholdInput] = useState('10');
  const [criticalStockThresholdInput, setCriticalStockThresholdInput] = useState('3');
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(10);

  const router = useRouter();
  const params = useSearchParams();
  const isEmbedded = params.get('embedded') === '1';
  useOutletEmbeddedBridge(isEmbedded, loading);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  const getPathWithCode = (path: string) => {
    const outletCode = params.get('outlet_code') || '';
    const query = new URLSearchParams();
    if (outletCode) query.set('outlet_code', outletCode);
    if (isEmbedded) query.set('embedded', '1');
    const queryString = query.toString();
    return `${path}${queryString ? `?${queryString}` : ''}`;
  };

  const getNextPath = () => {
    return getPathWithCode('/outlet-pos/stock');
  };

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  const redirectToLoginWithNext = () => {
    localStorage.removeItem('token');
    router.push(`/?next=${encodeURIComponent(getNextPath())}`);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const invalidStoredToken = !storedToken || storedToken === 'undefined' || storedToken === 'null';

    if (invalidStoredToken) {
      router.push(`/?next=${encodeURIComponent(getNextPath())}`);
      return;
    }

    setToken(storedToken);
  }, [router, params]);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_URL}/api/outlet-pos/me`, {
          headers: authHeaders(token),
          validateStatus: () => true,
        });

        if (res.status === 401) {
          redirectToLoginWithNext();
          return;
        }

        if (res.status >= 400) {
          setMessage(res.data?.message || 'Failed to load stock.');
          setStocks([]);
          return;
        }

        const payload = res.data?.data;
        const outlet = payload?.outlet;
        if (!outlet) {
          redirectToLoginWithNext();
          return;
        }

        setOutletName(outlet.name || 'Outlet');
        setOutletCode(outlet.code || '-');
        setStocks((payload?.stocks || []).filter((line: StockLine) => Number(line.available_qty) > 0));
      } catch (error: any) {
        console.error('Error loading outlet stock:', error);
        setMessage(error?.response?.data?.message || 'Failed to load stock.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, API_URL]);

  const filteredStocks = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return stocks;

    return stocks.filter((line) => `${line.code} ${line.name} ${line.unit}`.toLowerCase().includes(term));
  }, [stocks, search]);

  const lowStockThreshold = useMemo(() => {
    const parsed = Number(lowStockThresholdInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return 10;
    return parsed;
  }, [lowStockThresholdInput]);

  const criticalStockThreshold = useMemo(() => {
    const parsed = Number(criticalStockThresholdInput);
    if (!Number.isFinite(parsed) || parsed < 0) return 3;
    return Math.min(parsed, lowStockThreshold);
  }, [criticalStockThresholdInput, lowStockThreshold]);

  const lowStockReportRows = useMemo(
    () =>
      stocks
        .filter((line) => Number(line.available_qty || 0) <= lowStockThreshold)
        .sort((a, b) => Number(a.available_qty || 0) - Number(b.available_qty || 0)),
    [stocks, lowStockThreshold]
  );

  const criticalStockReportRows = useMemo(
    () => lowStockReportRows.filter((line) => Number(line.available_qty || 0) <= criticalStockThreshold),
    [lowStockReportRows, criticalStockThreshold]
  );

  const stockTableRows = useMemo(() => {
    if (stockViewMode === 'critical') {
      return filteredStocks.filter((line) => Number(line.available_qty || 0) <= criticalStockThreshold);
    }
    if (stockViewMode === 'low') {
      return filteredStocks.filter((line) => Number(line.available_qty || 0) <= lowStockThreshold);
    }
    return filteredStocks;
  }, [filteredStocks, stockViewMode, lowStockThreshold, criticalStockThreshold]);

  const stockTotalPages = useMemo(
    () => Math.max(1, Math.ceil(stockTableRows.length / stockPageSize)),
    [stockTableRows.length, stockPageSize]
  );

  const safeStockPage = Math.min(stockPage, stockTotalPages);
  const stockPageStartIndex = (safeStockPage - 1) * stockPageSize;
  const stockPageEndIndex = Math.min(stockPageStartIndex + stockPageSize, stockTableRows.length);

  const paginatedStockRows = useMemo(
    () => stockTableRows.slice(stockPageStartIndex, stockPageEndIndex),
    [stockTableRows, stockPageStartIndex, stockPageEndIndex]
  );

  const totals = useMemo(() => {
    const items = stockTableRows.length;
    const availableQty = stockTableRows.reduce((sum, line) => sum + Number(line.available_qty || 0), 0);
    const stockValue = stockTableRows.reduce((sum, line) => sum + Number(line.available_qty || 0) * Number(line.sell_price || 0), 0);
    return { items, availableQty, stockValue };
  }, [stockTableRows]);

  const lowStockShortfallQty = useMemo(
    () =>
      lowStockReportRows.reduce((sum, line) => {
        const qty = Number(line.available_qty || 0);
        return sum + Math.max(0, lowStockThreshold - qty);
      }, 0),
    [lowStockReportRows, lowStockThreshold]
  );

  const lowStockShortfallValue = useMemo(
    () =>
      lowStockReportRows.reduce((sum, line) => {
        const qty = Number(line.available_qty || 0);
        const shortage = Math.max(0, lowStockThreshold - qty);
        return sum + shortage * Number(line.sell_price || 0);
      }, 0),
    [lowStockReportRows, lowStockThreshold]
  );

  useEffect(() => {
    if (stockPage > stockTotalPages) {
      setStockPage(stockTotalPages);
    }
  }, [stockPage, stockTotalPages]);

  useEffect(() => {
    setStockPage(1);
  }, [search, stockViewMode, lowStockThreshold, criticalStockThreshold, stockPageSize]);

  const downloadLowStockReport = () => {
    if (lowStockReportRows.length === 0) {
      setMessage('No low stock lines available for current threshold.');
      return;
    }

    const csvEscape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = lowStockReportRows.map((line) => {
      const availableQty = Number(line.available_qty || 0);
      const shortfall = Math.max(0, lowStockThreshold - availableQty);
      return [
        line.code,
        line.name,
        line.unit || '-',
        availableQty.toFixed(2),
        Number(line.sell_price || 0).toFixed(2),
        shortfall.toFixed(2),
        (shortfall * Number(line.sell_price || 0)).toFixed(2),
      ]
        .map(csvEscape)
        .join(',');
    });

    const header = [
      'Item Code',
      'Item Name',
      'Unit',
      'Available Qty',
      'Sell Price',
      `Reorder Qty (Target ${lowStockThreshold})`,
      'Estimated Reorder Value',
    ]
      .map(csvEscape)
      .join(',');

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateTag = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `low-stock-report-${outletCode || 'outlet'}-${dateTag}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return (
      <div className={`${isEmbedded ? 'py-10' : 'min-h-screen'} bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 flex items-center justify-center`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen'} bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 relative overflow-hidden`}>
      {!isEmbedded ? (
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>
      ) : null}

      {!isEmbedded ? (
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Outlet POS - Stock</h1>
                <p className="text-xs text-gray-600">{outletName} ({outletCode})</p>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href={getPathWithCode('/outlet-pos')}
                  className="px-3 py-1.5 text-sm rounded-md border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100"
                >
                  Dashboard
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/create-sale')}
                  className="px-3 py-1.5 text-sm rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
                  Create Sale
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/sales')}
                  className="px-3 py-1.5 text-sm rounded-md border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
                >
                  Sales
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/cash-drawer')}
                  className="px-3 py-1.5 text-sm rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                >
                  Cash Drawer
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/loyalty-customers')}
                  className="px-3 py-1.5 text-sm rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                >
                  Loyalty
                </Link>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md text-sm font-medium hover:from-rose-600 hover:to-pink-600"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      ) : null}

      <main className={`relative z-10 ${isEmbedded ? 'w-full p-5 sm:p-5 lg:p-5' : 'max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8'} space-y-6`}>
        {message && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Items</div>
            <div className="text-2xl font-bold text-gray-900">{totals.items}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Available Qty</div>
            <div className="text-2xl font-bold text-gray-900">{totals.availableQty.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Estimated Stock Value</div>
            <div className="text-2xl font-bold text-gray-900">{totals.stockValue.toFixed(2)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-rose-900">Low Stock Report</h2>
              <p className="text-sm text-rose-700">Track critical and low quantities with reorder guidance.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Low Threshold
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={lowStockThresholdInput}
                  onChange={(e) => setLowStockThresholdInput(e.target.value)}
                  className="mt-1 w-28 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Critical Threshold
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={criticalStockThresholdInput}
                  onChange={(e) => setCriticalStockThresholdInput(e.target.value)}
                  className="mt-1 w-32 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                />
              </label>
              <button
                type="button"
                onClick={downloadLowStockReport}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Download CSV
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-red-200 bg-white p-3">
              <div className="text-xs text-red-600">Critical Items</div>
              <div className="text-xl font-bold text-red-700">{criticalStockReportRows.length}</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-3">
              <div className="text-xs text-amber-700">Low Stock Items</div>
              <div className="text-xl font-bold text-amber-700">{lowStockReportRows.length}</div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-white p-3">
              <div className="text-xs text-blue-700">Recommended Reorder Qty</div>
              <div className="text-xl font-bold text-blue-700">{lowStockShortfallQty.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white p-3">
              <div className="text-xs text-emerald-700">Estimated Reorder Value</div>
              <div className="text-xl font-bold text-emerald-700">{lowStockShortfallValue.toFixed(2)}</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Available Stock</h2>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <select
                value={stockViewMode}
                onChange={(e) => setStockViewMode(e.target.value as StockViewMode)}
                className="w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none sm:w-52"
              >
                <option value="all">All Items</option>
                <option value="low">Low Stock (≤ {lowStockThreshold})</option>
                <option value="critical">Critical Stock (≤ {criticalStockThreshold})</option>
              </select>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code or item name"
                className="w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none sm:w-72"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Available Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sell Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {stockTableRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No stock found for current filter.</td>
                  </tr>
                ) : (
                  paginatedStockRows.map((line) => (
                    <tr key={line.inventory_item_id}>
                      <td className="px-4 py-2 text-sm text-gray-800">{line.code} - {line.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{line.unit || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right text-rose-700 font-semibold">{Number(line.available_qty || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">{Number(line.sell_price || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">
                        {(Number(line.available_qty || 0) * Number(line.sell_price || 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {stockTableRows.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{stockPageStartIndex + 1}</span> to{' '}
                <span className="font-semibold text-gray-900">{stockPageEndIndex}</span> of{' '}
                <span className="font-semibold text-gray-900">{stockTableRows.length}</span> items
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={stockPageSize}
                  onChange={(e) => setStockPageSize(Number(e.target.value))}
                  className="rounded-lg border border-rose-100 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
                <button
                  type="button"
                  onClick={() => setStockPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeStockPage <= 1}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700">
                  Page {safeStockPage} of {stockTotalPages}
                </div>
                <button
                  type="button"
                  onClick={() => setStockPage((prev) => Math.min(stockTotalPages, prev + 1))}
                  disabled={safeStockPage >= stockTotalPages}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
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

export default function OutletStockPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
        </div>
      }
    >
      <OutletStockContent />
    </Suspense>
  );
}
