'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';

export default function StockManagement() {
  const [token, setToken] = useState('');
  const [totalItems, setTotalItems] = useState(0);
  const [lowStockItems, setLowStockItems] = useState(0);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [outOfStockItems, setOutOfStockItems] = useState(0);
  const [loading, setLoading] = useState(true);
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
      fetchDashboardData();
    }
  }, [token]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [inventoryResponse, suppliersResponse] = await Promise.all([
        axios.get('/api/stock/inventory', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 }
        }),
        axios.get('/api/stock/suppliers', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 }
        })
      ]);

      const inventoryItems = inventoryResponse.data?.success
        ? (inventoryResponse.data?.data?.data || inventoryResponse.data?.data || [])
        : [];

      const suppliers = suppliersResponse.data?.success
        ? (suppliersResponse.data?.data?.data || suppliersResponse.data?.data || [])
        : [];

      const lowStockCount = inventoryItems.filter((item: any) => {
        const currentStock = Number(item.current_stock) || 0;
        const minimumStock = Number(item.minimum_stock) || 0;
        return currentStock <= minimumStock;
      }).length;

      const outOfStockCount = inventoryItems.filter((item: any) => (Number(item.current_stock) || 0) <= 0).length;

      setTotalItems(inventoryItems.length);
      setLowStockItems(lowStockCount);
      setTotalSuppliers(suppliers.length);
      setOutOfStockItems(outOfStockCount);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setTotalItems(0);
      setLowStockItems(0);
      setTotalSuppliers(0);
      setOutOfStockItems(0);
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-28 right-10 w-80 h-80 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-16 left-1/3 w-80 h-80 bg-yellow-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <div className="relative z-10 space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <section className="rounded-3xl border border-white/60 bg-white/75 backdrop-blur-xl shadow-xl p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <p className="inline-flex items-center rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-700 uppercase tracking-wide">
                Warehouse Intelligence
              </p>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900">Stock Management Dashboard</h2>
              <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl">
                Track inventory health, supplier coverage, and stock risks with one operational cockpit.
              </p>
            </div>
            <Link
              href="/dashboard/stock/inventory"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200/70 hover:from-orange-600 hover:to-amber-600 transition"
            >
              <span>Open Inventory</span>
              <span>→</span>
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              title: 'Total Items',
              value: totalItems.toLocaleString(),
              icon: '📦',
              tone: 'from-orange-500 to-amber-500',
              panel: 'from-orange-50 to-amber-50 border-orange-200'
            },
            {
              title: 'Low Stock Items',
              value: lowStockItems.toLocaleString(),
              icon: '⚠️',
              tone: 'from-red-500 to-rose-500',
              panel: 'from-red-50 to-rose-50 border-red-200'
            },
            {
              title: 'Total Suppliers',
              value: totalSuppliers.toLocaleString(),
              icon: '🚚',
              tone: 'from-sky-500 to-cyan-500',
              panel: 'from-sky-50 to-cyan-50 border-sky-200'
            },
            {
              title: 'Out of Stock',
              value: outOfStockItems.toLocaleString(),
              icon: '❌',
              tone: 'from-slate-500 to-slate-600',
              panel: 'from-slate-50 to-gray-100 border-slate-200'
            }
          ].map((stat) => (
            <article key={stat.title} className={`rounded-2xl border bg-gradient-to-br ${stat.panel} p-5 shadow-md hover:shadow-lg transition`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-600">{stat.title}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${stat.tone} text-white flex items-center justify-center text-lg shadow`}>
                  {stat.icon}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-xl p-6 sm:p-8">
          <h3 className="text-xl font-semibold text-slate-900">Quick Actions</h3>
          <p className="text-sm text-slate-600 mt-1">Jump directly into day-to-day stock operations.</p>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <Link href="/dashboard/stock/inventory" className="group rounded-xl border border-orange-200 bg-orange-50 p-4 hover:bg-orange-100 transition">
              <div className="text-2xl">📦</div>
              <div className="mt-2 text-sm font-semibold text-orange-900">View Inventory</div>
              <div className="text-xs text-orange-700 mt-1">Items, pricing, batches</div>
            </Link>
            <Link href="/dashboard/stock/suppliers" className="group rounded-xl border border-sky-200 bg-sky-50 p-4 hover:bg-sky-100 transition">
              <div className="text-2xl">🚚</div>
              <div className="mt-2 text-sm font-semibold text-sky-900">Manage Suppliers</div>
              <div className="text-xs text-sky-700 mt-1">Partners and sourcing</div>
            </Link>
            <Link href="/dashboard/stock/levels" className="group rounded-xl border border-emerald-200 bg-emerald-50 p-4 hover:bg-emerald-100 transition">
              <div className="text-2xl">📊</div>
              <div className="mt-2 text-sm font-semibold text-emerald-900">Stock Levels</div>
              <div className="text-xs text-emerald-700 mt-1">Monitor thresholds</div>
            </Link>
            <Link href="/dashboard/stock/reports" className="group rounded-xl border border-violet-200 bg-violet-50 p-4 hover:bg-violet-100 transition">
              <div className="text-2xl">📈</div>
              <div className="mt-2 text-sm font-semibold text-violet-900">Reports</div>
              <div className="text-xs text-violet-700 mt-1">Usage and valuation</div>
            </Link>
            <Link href="/dashboard/stock/transfers" className="group rounded-xl border border-indigo-200 bg-indigo-50 p-4 hover:bg-indigo-100 transition">
              <div className="text-2xl">🔄</div>
              <div className="mt-2 text-sm font-semibold text-indigo-900">Transfer to Outlets</div>
              <div className="text-xs text-indigo-700 mt-1">Internal distribution</div>
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/80 backdrop-blur-xl shadow-xl p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-slate-900">Recent Activity</h3>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Coming Soon</span>
          </div>
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <p className="text-sm text-slate-500">Recent stock activities will appear here once event tracking is enabled.</p>
          </div>
        </section>
      </div>
    </div>
  );
}