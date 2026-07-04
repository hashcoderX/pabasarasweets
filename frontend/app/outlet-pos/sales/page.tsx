'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';

type SaleItem = {
  id: number;
  item_code: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type SaleRow = {
  id: number;
  sale_number: string;
  sale_date: string;
  customer_name?: string;
  total_quantity: number;
  total_amount: number;
  items: SaleItem[];
};

type SalesFilters = {
  search: string;
  fromDate: string;
  toDate: string;
  saleNumber: string;
  customerName: string;
  minAmount: string;
  maxAmount: string;
};

const initialFilters: SalesFilters = {
  search: '',
  fromDate: '',
  toDate: '',
  saleNumber: '',
  customerName: '',
  minAmount: '',
  maxAmount: '',
};

function OutletPosSalesContent() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [outletName, setOutletName] = useState('Outlet');
  const [outletCode, setOutletCode] = useState('-');
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [message, setMessage] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState<SalesFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<SalesFilters>(initialFilters);

  const router = useRouter();
  const params = useSearchParams();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';
  const formInputClass =
    'w-full rounded-xl border border-rose-100 bg-white/95 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none';

  const getBackPath = () => {
    const outletCode = params.get('outlet_code') || '';
    return `/outlet-pos${outletCode ? `?outlet_code=${encodeURIComponent(outletCode)}` : ''}`;
  };

  const redirectToLoginWithNext = () => {
    localStorage.removeItem('token');
    router.push(`/?next=${encodeURIComponent(`/outlet-pos/sales${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`)}`);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const invalidStoredToken = !storedToken || storedToken === 'undefined' || storedToken === 'null';

    if (invalidStoredToken) {
      router.push(`/?next=${encodeURIComponent(`/outlet-pos/sales${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`)}`);
      return;
    }

    setToken(storedToken);
  }, [router, params]);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        setMessage('');

        const profileRes = await axios.get(`${API_URL}/api/outlet-pos/me`, {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        });

        if (profileRes.status === 401) {
          redirectToLoginWithNext();
          return;
        }

        if (profileRes.status >= 400) {
          setMessage(profileRes.data?.message || 'Failed to load outlet profile.');
          return;
        }

        const outlet = profileRes.data?.data?.outlet;
        if (!outlet) {
          redirectToLoginWithNext();
          return;
        }

        setOutletName(outlet.name || 'Outlet');
        setOutletCode(outlet.code || '-');

        const salesRes = await axios.get(`${API_URL}/api/outlet-pos/sales`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            per_page: 20,
            page: currentPage,
            search: appliedFilters.search || undefined,
            from_date: appliedFilters.fromDate || undefined,
            to_date: appliedFilters.toDate || undefined,
            sale_number: appliedFilters.saleNumber || undefined,
            customer_name: appliedFilters.customerName || undefined,
            min_amount: appliedFilters.minAmount || undefined,
            max_amount: appliedFilters.maxAmount || undefined,
          },
          validateStatus: () => true,
        });

        if (salesRes.status === 401) {
          redirectToLoginWithNext();
          return;
        }

        if (salesRes.status >= 400) {
          setRows([]);
          setMessage(salesRes.data?.message || 'Failed to load sales.');
          return;
        }

        const payload = salesRes.data?.data || {};
        setRows(Array.isArray(payload.data) ? payload.data : []);
        setCurrentPage(Number(payload.current_page) || 1);
        setLastPage(Number(payload.last_page) || 1);
        setTotalRows(Number(payload.total) || 0);
      } catch (error: any) {
        console.error('Error loading outlet sales page:', error);
        setRows([]);
        setMessage(error?.response?.data?.message || 'Failed to load sales data.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, currentPage, API_URL, params, router, appliedFilters]);

  const applyFilters = () => {
    setCurrentPage(1);
    setAppliedFilters(draftFilters);
  };

  const resetFilters = () => {
    setCurrentPage(1);
    setDraftFilters(initialFilters);
    setAppliedFilters(initialFilters);
  };

  const totals = useMemo(() => {
    const qty = rows.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0);
    const amount = rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    return { qty, amount };
  }, [rows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Outlet POS - Sales</h1>
              <p className="text-sm text-gray-600">{outletName} ({outletCode})</p>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Link
                href={getBackPath()}
                className="px-3 py-1.5 text-sm rounded-md border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100"
              >
                Dashboard
              </Link>
              <Link
                href={`/outlet-pos/create-sale${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`}
                className="px-3 py-1.5 text-sm rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              >
                Create Sale
              </Link>
              <Link
                href={`/outlet-pos/stock${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`}
                className="px-3 py-1.5 text-sm rounded-md border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
              >
                Stock
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Recent Sales</h2>
              <p className="text-sm text-gray-600">Track sales records with quick filters and polished insights.</p>
            </div>
            <Link
              href={getBackPath()}
              className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md text-sm font-medium hover:from-rose-600 hover:to-pink-600"
            >
              Back to POS
            </Link>
          </div>
        </section>

        {message && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>
        )}

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sales Filters</h2>
              <p className="text-sm text-gray-600">Use date range and advanced criteria to find sales quickly.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className="px-3 py-2 border border-rose-200 bg-rose-50 rounded-md text-sm text-rose-700 hover:bg-rose-100"
            >
              {showAdvancedFilters ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={draftFilters.search}
                onChange={(e) => setDraftFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Sale #, customer, outlet"
                className={formInputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={draftFilters.fromDate}
                onChange={(e) => setDraftFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
                className={formInputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={draftFilters.toDate}
                onChange={(e) => setDraftFilters((prev) => ({ ...prev, toDate: e.target.value }))}
                className={formInputClass}
              />
            </div>
          </div>

          {showAdvancedFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sale Number</label>
                <input
                  type="text"
                  value={draftFilters.saleNumber}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, saleNumber: e.target.value }))}
                  placeholder="Exact/partial sale #"
                  className={formInputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={draftFilters.customerName}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, customerName: e.target.value }))}
                  placeholder="Customer contains"
                  className={formInputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftFilters.minAmount}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, minAmount: e.target.value }))}
                  placeholder="0.00"
                  className={formInputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draftFilters.maxAmount}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, maxAmount: e.target.value }))}
                  placeholder="0.00"
                  className={formInputClass}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-slate-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700"
            >
              Apply Filters
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Rows In This Page</div>
            <div className="text-2xl font-bold text-gray-900">{rows.length}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Total Qty (Page)</div>
            <div className="text-2xl font-bold text-gray-900">{totals.qty.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Total Amount (Page)</div>
            <div className="text-2xl font-bold text-gray-900">{totals.amount.toFixed(2)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Sales List</h2>
            <p className="text-sm text-gray-600">Total Records: <span className="font-semibold text-gray-900">{totalRows}</span></p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-rose-100">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-rose-50 to-pink-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sale #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No sales found.</td>
                  </tr>
                ) : (
                  rows.map((sale) => (
                    <tr key={sale.id} className="hover:bg-rose-50/50 transition-colors">
                      <td className="px-4 py-2 text-sm font-semibold text-gray-800">{sale.sale_number}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{new Date(sale.sale_date).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{sale.customer_name || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">{Number(sale.total_quantity).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(sale.total_amount).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-white disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">Page {currentPage} of {lastPage}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(lastPage, prev + 1))}
              disabled={currentPage >= lastPage}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-sm text-slate-700 hover:bg-white disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function OutletPosSalesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
        </div>
      }
    >
      <OutletPosSalesContent />
    </Suspense>
  );
}
