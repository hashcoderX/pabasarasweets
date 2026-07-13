'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';

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

function OutletStockContent() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<StockLine[]>([]);
  const [outletName, setOutletName] = useState('');
  const [outletCode, setOutletCode] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const router = useRouter();
  const params = useSearchParams();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  const getNextPath = () => {
    const code = params.get('outlet_code') || '';
    return `/outlet-pos/stock${code ? `?outlet_code=${encodeURIComponent(code)}` : ''}`;
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

  const totals = useMemo(() => {
    const items = filteredStocks.length;
    const availableQty = filteredStocks.reduce((sum, line) => sum + Number(line.available_qty || 0), 0);
    const stockValue = filteredStocks.reduce((sum, line) => sum + Number(line.available_qty || 0) * Number(line.sell_price || 0), 0);
    return { items, availableQty, stockValue };
  }, [filteredStocks]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

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
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

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
                  href={`/outlet-pos${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`}
                  className="px-3 py-1.5 text-sm rounded-md border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100"
                >
                  Dashboard
                </Link>
                <Link
                  href={`/outlet-pos/create-sale${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`}
                  className="px-3 py-1.5 text-sm rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                >
                  Create Sale
                </Link>
                <Link
                  href={`/outlet-pos/sales${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`}
                  className="px-3 py-1.5 text-sm rounded-md border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
                >
                  Sales
                </Link>
                <Link
                  href={`/outlet-pos/cash-drawer${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`}
                  className="px-3 py-1.5 text-sm rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                >
                  Cash Drawer
                </Link>
                <Link
                  href={`/outlet-pos/loyalty-customers${params.get('outlet_code') ? `?outlet_code=${encodeURIComponent(params.get('outlet_code') || '')}` : ''}`}
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

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
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

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Available Stock</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code or item name"
              className="w-full max-w-xs rounded-xl border border-rose-100 bg-white/95 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none"
            />
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
                {filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No stock found for current filter.</td>
                  </tr>
                ) : (
                  filteredStocks.map((line) => (
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
