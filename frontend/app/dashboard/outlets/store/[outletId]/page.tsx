'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';

type OutletInfo = {
  id: number;
  name: string;
  code: string;
};

type StockLine = {
  inventory_item_id: number;
  name: string;
  code: string;
  unit: string;
  available_quantity: number;
};

export default function OutletStorePage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [outlet, setOutlet] = useState<OutletInfo | null>(null);
  const [stockLines, setStockLines] = useState<StockLine[]>([]);
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

        const [outletRes, stockRes] = await Promise.all([
          axios.get(`${API_URL}/api/outlets/${outletId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${API_URL}/api/outlets/${outletId}/stock-report`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const outletData = outletRes.data?.data;
        const stocks = stockRes.data?.data?.stocks || [];

        setOutlet(outletData ? { id: outletData.id, name: outletData.name, code: outletData.code } : null);
        setStockLines(stocks);
      } catch (error: any) {
        console.error('Error loading outlet store page:', error);
        setMessage(error?.response?.data?.message || 'Failed to load outlet store.');
        setOutlet(null);
        setStockLines([]);
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

  const totals = useMemo(() => {
    const totalQty = stockLines.reduce((sum, line) => sum + Number(line.available_quantity || 0), 0);
    return {
      itemCount: stockLines.length,
      totalQty,
    };
  }, [stockLines]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Outlet Store</h1>
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
          <div className="flex flex-wrap gap-4 text-sm text-black">
            <span>Total Items: <strong>{totals.itemCount}</strong></span>
            <span>Total Available Qty: <strong>{totals.totalQty.toFixed(2)}</strong></span>
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-800">Store Stock Lines</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Available Qty</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {stockLines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No stock lines found for this outlet.</td>
                  </tr>
                ) : (
                  stockLines.map((line) => (
                    <tr key={line.inventory_item_id}>
                      <td className="px-4 py-2 text-sm text-gray-800">{line.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{line.code}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{line.unit || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(line.available_quantity || 0).toFixed(2)}</td>
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
