'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';

type OutletInfo = {
  id: number;
  name: string;
  code: string;
};

type ItemWiseRow = {
  inventory_item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  total_qty: number;
  total_amount: number;
};

type SaleRow = {
  id: number;
  sale_number: string;
  sale_date: string;
  customer_name: string | null;
  total_quantity: number;
  total_amount: number;
};

export default function OutletSalesPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [outlet, setOutlet] = useState<OutletInfo | null>(null);
  const [totals, setTotals] = useState({ total_sales: 0, total_quantity: 0, total_amount: 0 });
  const [itemWise, setItemWise] = useState<ItemWiseRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [message, setMessage] = useState('');

  const router = useRouter();
  const params = useParams<{ outletId: string }>();
  const outletId = params?.outletId;
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
    if (!token || !outletId) return;

    const load = async () => {
      try {
        setLoading(true);
        setMessage('');

        const res = await axios.get(`${API_URL}/api/outlet-pos/outlets/${outletId}/sales-report`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = res.data?.data || {};
        setOutlet(data?.outlet || null);
        setTotals(data?.totals || { total_sales: 0, total_quantity: 0, total_amount: 0 });
        setItemWise(data?.item_wise || []);
        setSales(data?.sales || []);
      } catch (error: any) {
        console.error('Error loading outlet sales page:', error);
        setMessage(error?.response?.data?.message || 'Failed to load outlet sales records.');
        setOutlet(null);
        setTotals({ total_sales: 0, total_quantity: 0, total_amount: 0 });
        setItemWise([]);
        setSales([]);
        if (error?.response?.status === 401) {
          localStorage.removeItem('token');
          router.push('/');
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, outletId, API_URL, router]);

  const topItems = useMemo(() => itemWise.slice(0, 5), [itemWise]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Outlet Sales Records</h1>
              <p className="text-xs text-gray-500">{outlet ? `${outlet.code} - ${outlet.name}` : 'Outlet not found'}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/outlets/management')}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to Outlets
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        {message && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>
        )}

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex flex-wrap gap-6 text-sm text-black">
            <span>Total Sales: <strong>{Number(totals.total_sales || 0)}</strong></span>
            <span>Total Qty: <strong>{Number(totals.total_quantity || 0).toFixed(2)}</strong></span>
            <span>Total Amount: <strong>{Number(totals.total_amount || 0).toFixed(2)}</strong></span>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-800">Item-wise Sales (Qty & Amount)</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sales Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sales Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {itemWise.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No item-wise sales found.</td>
                  </tr>
                ) : (
                  itemWise.map((line) => (
                    <tr key={`${line.inventory_item_id}-${line.item_code}`}>
                      <td className="px-4 py-2 text-sm text-gray-800">{line.item_name}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{line.item_code}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{line.unit || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(line.total_qty || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(line.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-800">Sales History</div>
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
                {sales.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No sales records found.</td>
                  </tr>
                ) : (
                  sales.map((record) => (
                    <tr key={record.id}>
                      <td className="px-4 py-2 text-sm text-gray-800">{record.sale_number}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{new Date(record.sale_date).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{record.customer_name || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(record.total_quantity || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(record.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {topItems.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">Top Selling Items</h2>
            <div className="text-sm text-gray-700">
              {topItems.map((line) => `${line.item_code} (${line.total_qty.toFixed(2)})`).join(' | ')}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
