'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

type SaleRow = {
  id: number;
  sale_number: string;
  sale_date: string;
  customer_name?: string;
  total_quantity: number;
  total_amount: number;
};

type CashierSessionStatus = {
  is_open: boolean;
  is_closed: boolean;
  needs_open: boolean;
  session_date?: string;
};

type DailyBalanceSheet = {
  session_date: string;
  opening_balance: number;
  closing_balance: number;
  balance_difference: number;
  total_sales: number;
  total_sales_amount: number;
};

function OutletPosDashboardContent() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [outletName, setOutletName] = useState('');
  const [outletCode, setOutletCode] = useState('');
  const [outletId, setOutletId] = useState<number | null>(null);
  const [stocks, setStocks] = useState<StockLine[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [latestSalesPage, setLatestSalesPage] = useState(1);
  const [latestSalesPageSize, setLatestSalesPageSize] = useState(8);
  const [cashierSession, setCashierSession] = useState<CashierSessionStatus | null>(null);
  const [balanceSheetDate, setBalanceSheetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailyBalanceSheet, setDailyBalanceSheet] = useState<DailyBalanceSheet | null>(null);
  const [balanceSheetLoading, setBalanceSheetLoading] = useState(false);
  const [message, setMessage] = useState('');

  const router = useRouter();
  const params = useSearchParams();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  const getPathWithCode = (path: string) => {
    const outletCode = params.get('outlet_code') || '';
    return `${path}${outletCode ? `?outlet_code=${encodeURIComponent(outletCode)}` : ''}`;
  };

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  const redirectToLoginWithNext = () => {
    localStorage.removeItem('token');
    router.push(`/?next=${encodeURIComponent(getPathWithCode('/outlet-pos'))}`);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const invalidStoredToken = !storedToken || storedToken === 'undefined' || storedToken === 'null';

    if (invalidStoredToken) {
      router.push(`/?next=${encodeURIComponent(getPathWithCode('/outlet-pos'))}`);
      return;
    }

    setToken(storedToken);
  }, [router, params]);

  const loadData = async (authToken: string) => {
    const profileRes = await axios.get(`${API_URL}/api/outlet-pos/me`, {
      headers: authHeaders(authToken),
      validateStatus: () => true,
    });

    if (profileRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (profileRes.status >= 400) {
      setMessage(profileRes.data?.message || 'Failed to load outlet profile.');
      return false;
    }

    const payload = profileRes.data?.data;
    const outlet = payload?.outlet;

    if (!outlet) {
      redirectToLoginWithNext();
      return false;
    }

    setOutletName(outlet.name || 'Outlet');
    setOutletCode(outlet.code || '-');
    const currentOutletId = Number(outlet.id) || null;
    setOutletId(currentOutletId);
    setStocks((payload?.stocks || []).filter((line: StockLine) => Number(line.available_qty) > 0));

    const sessionRes = await axios.get(`${API_URL}/api/outlet-pos/cash-drawer-status`, {
      headers: authHeaders(authToken),
      validateStatus: () => true,
    });

    if (sessionRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (sessionRes.status < 400) {
      setCashierSession(sessionRes.data?.data?.session || null);
    }

    const salesRes = await axios.get(`${API_URL}/api/outlet-pos/sales`, {
      headers: authHeaders(authToken),
      params: { per_page: 100 },
      validateStatus: () => true,
    });

    if (salesRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (salesRes.status >= 400) {
      setMessage(salesRes.data?.message || 'Failed to load outlet sales.');
      setSales([]);
      return false;
    }

    setSales(salesRes.data?.data?.data || []);

    if (currentOutletId) {
      await loadDailyBalanceSheet(authToken, currentOutletId, balanceSheetDate);
    }

    return true;
  };

  const loadDailyBalanceSheet = async (authToken: string, currentOutletId?: number | null, sessionDate?: string) => {
    const targetOutletId = currentOutletId || outletId;
    if (!targetOutletId) return;

    try {
      setBalanceSheetLoading(true);
      const response = await axios.get(`${API_URL}/api/outlet-pos/cash-drawer-balance-sheet`, {
        headers: authHeaders(authToken),
        params: {
          outlet_id: targetOutletId,
          session_date: sessionDate || balanceSheetDate,
        },
        validateStatus: () => true,
      });

      if (response.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (response.status >= 400) {
        setDailyBalanceSheet(null);
        return;
      }

      const data = response.data?.data;
      setDailyBalanceSheet({
        session_date: data?.session_date || (sessionDate || balanceSheetDate),
        opening_balance: Number(data?.opening_balance || 0),
        closing_balance: Number(data?.closing_balance || 0),
        balance_difference: Number(data?.balance_difference || 0),
        total_sales: Number(data?.total_sales || 0),
        total_sales_amount: Number(data?.total_sales_amount || 0),
      });
    } catch (error) {
      console.error('Error loading daily balance sheet:', error);
      setDailyBalanceSheet(null);
    } finally {
      setBalanceSheetLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        setMessage('');
        await loadData(token);
      } catch (error: any) {
        console.error('Error loading outlet dashboard:', error);
        setMessage(error?.response?.data?.message || 'Failed to load outlet dashboard.');
        if (error?.response?.status === 401) {
          redirectToLoginWithNext();
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, API_URL, params, router]);

  const stockTotals = useMemo(() => {
    const totalItems = stocks.length;
    const totalAvailableQty = stocks.reduce((sum, line) => sum + Number(line.available_qty || 0), 0);
    return { totalItems, totalAvailableQty };
  }, [stocks]);

  const handleLogout = () => {
    if (cashierSession?.is_open) {
      alert('Cashier is still open. Please close cash drawer before logout.');
      router.push(getPathWithCode('/outlet-pos/cash-drawer'));
      return;
    }

    localStorage.removeItem('token');
    router.push('/');
  };

  const salesTotals = useMemo(() => {
    const totalSales = sales.length;
    const totalQty = sales.reduce((sum, sale) => sum + Number(sale.total_quantity || 0), 0);
    const totalAmount = sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
    return { totalSales, totalQty, totalAmount };
  }, [sales]);

  const salesByDay = useMemo(() => {
    const map = new Map<string, number>();

    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }

    sales.forEach((sale) => {
      const key = String(sale.sale_date || '').slice(0, 10);
      if (map.has(key)) {
        map.set(key, Number(map.get(key) || 0) + Number(sale.total_amount || 0));
      }
    });

    const max = Math.max(...Array.from(map.values()), 1);
    return Array.from(map.entries()).map(([date, amount]) => ({
      date,
      label: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
      amount,
      heightPct: Math.max(8, Math.round((amount / max) * 100)),
    }));
  }, [sales]);

  const topStocks = useMemo(() => {
    const top = [...stocks]
      .sort((a, b) => Number(b.available_qty || 0) - Number(a.available_qty || 0))
      .slice(0, 6);

    const max = Math.max(...top.map((line) => Number(line.available_qty || 0)), 1);

    return top.map((line) => ({
      ...line,
      widthPct: Math.max(10, Math.round((Number(line.available_qty || 0) / max) * 100)),
    }));
  }, [stocks]);

  const dailyReportSummary = useMemo(() => {
    if (!dailyBalanceSheet) {
      return {
        startBalance: 0,
        credit: 0,
        debit: 0,
        expectedBalance: 0,
        endBalance: 0,
        difference: 0,
      };
    }

    const startBalance = Number(dailyBalanceSheet.opening_balance || 0);
    const endBalance = Number(dailyBalanceSheet.closing_balance || 0);
    const movement = endBalance - startBalance;
    const credit = movement > 0 ? movement : 0;
    const debit = movement < 0 ? Math.abs(movement) : 0;
    const expectedBalance = startBalance + credit - debit;
    const difference = Number(dailyBalanceSheet.balance_difference || 0);

    return {
      startBalance,
      credit,
      debit,
      expectedBalance,
      endBalance,
      difference,
    };
  }, [dailyBalanceSheet]);

  const latestSalesTotalPages = useMemo(
    () => Math.max(1, Math.ceil(sales.length / latestSalesPageSize)),
    [sales.length, latestSalesPageSize]
  );

  const safeLatestSalesPage = Math.min(latestSalesPage, latestSalesTotalPages);
  const latestSalesStartIndex = (safeLatestSalesPage - 1) * latestSalesPageSize;
  const latestSalesEndIndex = Math.min(latestSalesStartIndex + latestSalesPageSize, sales.length);

  const paginatedLatestSales = useMemo(
    () => sales.slice(latestSalesStartIndex, latestSalesEndIndex),
    [sales, latestSalesStartIndex, latestSalesEndIndex]
  );

  useEffect(() => {
    if (latestSalesPage > latestSalesTotalPages) {
      setLatestSalesPage(latestSalesTotalPages);
    }
  }, [latestSalesPage, latestSalesTotalPages]);

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
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Outlet POS Dashboard</h1>
                <p className="text-xs text-gray-600">{outletName} ({outletCode})</p>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href={getPathWithCode('/outlet-pos/create-sale')}
                  className="px-3 py-1.5 text-sm rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                >
                  Create Sale
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/sales')}
                  className="px-3 py-1.5 text-sm rounded-md border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
                >
                  Sales Records
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/cash-drawer')}
                  className="px-3 py-1.5 text-sm rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                >
                  Cash Drawer
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/stock')}
                  className="px-3 py-1.5 text-sm rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                >
                  Stock
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/loyalty-customers')}
                  className="px-3 py-1.5 text-sm rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                >
                  Loyalty Customers
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

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
              <p className="text-sm text-gray-600">Use this dashboard for monitoring and jump into cashier flow when needed.</p>
              <p className={`text-xs mt-1 ${cashierSession?.is_open ? 'text-emerald-700' : 'text-amber-700'}`}>
                Cashier: {cashierSession?.is_open ? 'Open' : 'Not Open'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={getPathWithCode('/outlet-pos/create-sale')}
                className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md text-sm font-medium hover:from-rose-600 hover:to-pink-600"
              >
                Go To Create Sale
              </Link>
              <Link
                href={getPathWithCode('/outlet-pos/sales')}
                className="px-4 py-2 border border-pink-200 bg-pink-50 text-pink-700 rounded-md text-sm font-medium hover:bg-pink-100"
              >
                Open Sales Records
              </Link>
              <Link
                href={getPathWithCode('/outlet-pos/cash-drawer')}
                className="px-4 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-md text-sm font-medium hover:bg-emerald-100"
              >
                Set Cash Drawer
              </Link>
              <Link
                href={getPathWithCode('/outlet-pos/stock')}
                className="px-4 py-2 border border-rose-200 bg-rose-50 text-rose-700 rounded-md text-sm font-medium hover:bg-rose-100"
              >
                View Stock
              </Link>
              <Link
                href={getPathWithCode('/outlet-pos/loyalty-customers')}
                className="px-4 py-2 border border-amber-200 bg-amber-50 text-amber-700 rounded-md text-sm font-medium hover:bg-amber-100"
              >
                Loyalty Customers
              </Link>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Items In Store</div>
            <div className="text-2xl font-bold text-gray-900">{stockTotals.totalItems}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Available Qty</div>
            <div className="text-2xl font-bold text-gray-900">{stockTotals.totalAvailableQty.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Recent Sales</div>
            <div className="text-2xl font-bold text-gray-900">{salesTotals.totalSales}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Recent Sales Amount</div>
            <div className="text-2xl font-bold text-gray-900">{salesTotals.totalAmount.toFixed(2)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Daily Balance Sheet</h3>
              <p className="text-sm text-gray-600">Credit = received cash (increase). Debit = transfer cash (decrease) from the cash drawer balance.</p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Session Date</label>
                <input
                  type="date"
                  value={balanceSheetDate}
                  onChange={(e) => setBalanceSheetDate(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </div>
              <button
                type="button"
                onClick={() => loadDailyBalanceSheet(token, outletId, balanceSheetDate)}
                disabled={balanceSheetLoading || !outletId}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-md text-sm font-medium hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
              >
                {balanceSheetLoading ? 'Loading...' : 'Get Balance Sheet'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="text-xs text-gray-500">Start Balance</div>
              <div className="text-lg font-bold text-emerald-700">{dailyReportSummary.startBalance.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
              <div className="text-xs text-gray-500">Credit</div>
              <div className="text-lg font-bold text-cyan-700">{dailyReportSummary.credit.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
              <div className="text-xs text-gray-500">Debit</div>
              <div className="text-lg font-bold text-orange-700">{dailyReportSummary.debit.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-gray-500">Expected Balance</div>
              <div className="text-lg font-bold text-slate-900">{dailyReportSummary.expectedBalance.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="text-xs text-gray-500">Current Balance</div>
              <div className="text-lg font-bold text-indigo-700">{dailyReportSummary.endBalance.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-4">
              <div className="text-xs text-gray-500">Difference</div>
              <div className="text-lg font-bold text-rose-700">{dailyReportSummary.difference.toFixed(2)}</div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Sales Trend (Last 7 Days)</h3>
            <p className="text-sm text-gray-600 mb-4">Based on loaded POS sales amounts.</p>
            <div className="h-48 rounded-xl bg-gradient-to-b from-pink-50 to-rose-50 border border-pink-100 px-3 py-4">
              <div className="h-full flex items-end justify-between gap-2">
                {salesByDay.map((point) => (
                  <div key={point.date} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1">
                    <div className="w-full bg-gradient-to-t from-rose-500 to-pink-400 rounded-t-md" style={{ height: `${point.heightPct}%` }}></div>
                    <div className="text-[11px] text-gray-600">{point.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Top Available Stock</h3>
            <p className="text-sm text-gray-600 mb-4">Highest available quantities at this outlet.</p>
            <div className="space-y-3">
              {topStocks.length === 0 ? (
                <div className="text-sm text-gray-500">No available stock for this outlet.</div>
              ) : (
                topStocks.map((line) => (
                  <div key={line.inventory_item_id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium">{line.code} - {line.name}</span>
                      <span className="text-rose-700 font-semibold">{Number(line.available_qty).toFixed(2)} {line.unit}</span>
                    </div>
                    <div className="h-2 rounded-full bg-rose-100">
                      <div className="h-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500" style={{ width: `${line.widthPct}%` }}></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Latest Sales Snapshot</h3>
            <Link
              href={getPathWithCode('/outlet-pos/sales')}
              className="text-sm text-pink-700 hover:text-pink-800 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sale #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginatedLatestSales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">No sales found.</td>
                  </tr>
                ) : (
                  paginatedLatestSales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="px-4 py-2 text-sm text-gray-800">{sale.sale_number}</td>
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

          <div className="mt-4 flex flex-col gap-3 border-t border-pink-100 bg-pink-50/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              Showing {sales.length === 0 ? 0 : latestSalesStartIndex + 1} to {latestSalesEndIndex} of {sales.length} sales
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Rows</label>
                <select
                  value={latestSalesPageSize}
                  onChange={(e) => {
                    setLatestSalesPageSize(Number(e.target.value));
                    setLatestSalesPage(1);
                  }}
                  className="rounded-md border border-pink-200 bg-white px-2 py-1 text-sm text-gray-700"
                >
                  <option value={5}>5</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLatestSalesPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeLatestSalesPage <= 1}
                  className="rounded-full border border-pink-200 bg-white px-3 py-1 text-xs font-semibold text-pink-700 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm font-semibold text-gray-700">
                  Page {safeLatestSalesPage} of {latestSalesTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setLatestSalesPage((prev) => Math.min(latestSalesTotalPages, prev + 1))}
                  disabled={safeLatestSalesPage >= latestSalesTotalPages}
                  className="rounded-full border border-pink-200 bg-white px-3 py-1 text-xs font-semibold text-pink-700 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function OutletPosDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
        </div>
      }
    >
      <OutletPosDashboardContent />
    </Suspense>
  );
}
