'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type SummaryRow = {
  outlet_id: number;
  outlet_name: string;
  outlet_code: string;
  total_sales: number;
  total_quantity: number;
  total_amount: number;
};

type SaleRow = {
  id: number;
  sale_number: string;
  sale_date: string;
  customer_name?: string;
  total_quantity: number;
  total_amount: number;
  outlet?: {
    id: number;
    name: string;
    code: string;
  };
};

export default function OutletSalesTrackingPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [message, setMessage] = useState('');
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

  const loadData = async (authToken: string) => {
    try {
      setLoading(true);
      setMessage('');

      const [summaryRes, salesRes] = await Promise.all([
        axios.get(`${API_URL}/api/outlet-pos/sales-summary`, {
          headers: { Authorization: `Bearer ${authToken}` },
          params: { from_date: fromDate || undefined, to_date: toDate || undefined },
        }),
        axios.get(`${API_URL}/api/outlet-pos/sales`, {
          headers: { Authorization: `Bearer ${authToken}` },
          params: { from_date: fromDate || undefined, to_date: toDate || undefined, per_page: 100 },
        }),
      ]);

      setSummary(summaryRes.data?.data || []);
      setSales(salesRes.data?.data?.data || []);
    } catch (error: any) {
      console.error('Error loading outlet sales tracking:', error);
      setMessage(error?.response?.data?.message || 'Failed to load outlet sales tracking data.');
      setSummary([]);
      setSales([]);
      if (error?.response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadData(token);
    }
  }, [token]);

  const grandTotal = summary.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const grandCount = summary.reduce((sum, row) => sum + Number(row.total_sales || 0), 0);
  const grandQty = summary.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0);
  const averageTicket = grandCount > 0 ? grandTotal / grandCount : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Outlet Sales Tracking</h1>
              <p className="text-xs text-gray-600">Admin intelligence view for every outlet POS sale</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/outlets')}
              className="px-4 py-2 border border-rose-200 bg-rose-50 text-rose-700 rounded-md text-sm font-medium hover:bg-rose-100"
            >
              Back to Outlets
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        {message && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>
        )}

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Filter Window</h2>
              <p className="text-sm text-gray-600">Control the period to analyze sales movement across outlets.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(end.getDate() - 6);
                  setFromDate(start.toISOString().slice(0, 10));
                  setToDate(end.toISOString().slice(0, 10));
                }}
                className="px-3 py-1.5 text-xs rounded-md border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(end.getDate() - 29);
                  setFromDate(start.toISOString().slice(0, 10));
                  setToDate(end.toISOString().slice(0, 10));
                }}
                className="px-3 py-1.5 text-xs rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              >
                Last 30 Days
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2 flex items-end gap-2">
              <button
                onClick={() => token && loadData(token)}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700"
              >
                Apply Filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
              >
                Clear Dates
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Sales Count</div>
            <div className="text-2xl font-bold text-gray-900">{grandCount}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Sales Amount</div>
            <div className="text-2xl font-bold text-gray-900">{grandTotal.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Sold Quantity</div>
            <div className="text-2xl font-bold text-gray-900">{grandQty.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Outlets With Sales</div>
            <div className="text-2xl font-bold text-gray-900">{summary.length}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Avg Ticket</div>
            <div className="text-2xl font-bold text-gray-900">{averageTicket.toFixed(2)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-rose-50 to-pink-50 text-sm font-semibold text-gray-800">Outlet-wise Summary</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sales Count</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Loading...</td></tr>
                ) : summary.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No summary records found.</td></tr>
                ) : (
                  summary.map((row) => (
                    <tr key={row.outlet_id} className="hover:bg-rose-50/40 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-gray-800">
                        <div className="font-medium">{row.outlet_code} - {row.outlet_name}</div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(row.total_sales || 0)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(row.total_quantity || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-semibold">{Number(row.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-blue-50 to-indigo-50 text-sm font-semibold text-gray-800">Recent Sales Lines</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sale #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">Loading...</td></tr>
                ) : sales.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No sales found.</td></tr>
                ) : (
                  sales.map((row) => (
                    <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">{row.sale_number}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{row.outlet?.code || '-'} - {row.outlet?.name || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{new Date(row.sale_date).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{row.customer_name || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(row.total_quantity || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-semibold">{Number(row.total_amount || 0).toFixed(2)}</td>
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
