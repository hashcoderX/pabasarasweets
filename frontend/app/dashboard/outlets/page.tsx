'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useRouter } from 'next/navigation';

interface Outlet {
  id: number;
  name: string;
  code: string;
  status: 'active' | 'inactive';
}

interface OutletStockLine {
  inventory_item_id: number;
  name: string;
  code: string;
  unit: string;
  available_quantity: number;
}

export default function OutletsPage() {
  const [token, setToken] = useState('');
  const [outletCount, setOutletCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [stockLines, setStockLines] = useState<OutletStockLine[]>([]);
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
      fetchStats();
    }
  }, [token]);

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/outlets', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 100 }
      });

      const outlets = response.data.success ? (response.data.data.data || response.data.data || []) : [];
      setOutlets(outlets);
      setOutletCount(outlets.length);
      setActiveCount(outlets.filter((outlet: any) => outlet.status === 'active').length);
    } catch (error) {
      console.error('Error fetching outlet stats:', error);
      setOutlets([]);
      setOutletCount(0);
      setActiveCount(0);
    }
  };

  const openStockReport = async (outlet: Outlet) => {
    try {
      setSelectedOutlet(outlet);
      setStockModalOpen(true);
      setStockLoading(true);

      const response = await axios.get(`/api/outlets/${outlet.id}/stock-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const lines = response.data?.success ? (response.data?.data?.stocks || []) : [];
      setStockLines(lines);
    } catch (error) {
      console.error('Error fetching outlet stock report:', error);
      setStockLines([]);
    } finally {
      setStockLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_28%),linear-gradient(180deg,_#fffaf5_0%,_#fff7ed_42%,_#fff3e4_100%)]">
      <nav className="border-b border-orange-100 bg-white/85 shadow-sm backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-lg text-white shadow-md shadow-orange-200">
                🏪
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">Outlets Module</h1>
                <p className="text-xs text-slate-500">Outlet operations and records</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-12 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">Outlets Module</h2>
            <p className="max-w-3xl text-lg text-slate-600">
              Manage your outlet network with clean CRUD operations and real-time records.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={() => router.push('/dashboard/outlets/sales')}
              className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100"
            >
              Outlet Sales Tracking
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-full border border-transparent bg-gradient-to-r from-orange-600 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-orange-700 hover:to-amber-600"
            >
              Dashboard
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Link
            href="/dashboard/outlets/management"
            className="group overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_75px_-35px_rgba(194,65,12,0.5)]"
          >
            <div className="p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-2xl shadow-md shadow-orange-200 transition-transform duration-300 group-hover:scale-110">
                🏪
              </div>
              <h3 className="mb-2 text-xl font-semibold text-slate-900">Outlets Management</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                Create, edit, and delete outlet records from a single management screen.
              </p>
              <div className="mt-4 flex items-center text-sm font-semibold text-orange-700 group-hover:text-orange-800">
                <span>Open Management</span>
                <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>

          <div className="rounded-2xl border border-orange-100 bg-white p-8 shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
            <h2 className="mb-4 text-2xl font-bold text-slate-900">Outlets Overview</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-2xl border border-orange-200/70 bg-gradient-to-br from-orange-500 to-amber-500 px-4 py-5 text-center text-white">
                <div className="mb-2 text-3xl font-bold">{outletCount}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-white/85">Total Outlets</div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
                <div className="mb-2 text-3xl font-bold text-emerald-700">{activeCount}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">Active Outlets</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
          <div className="border-b border-orange-100 bg-gradient-to-r from-slate-900 via-orange-900 to-amber-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-amber-100">Outlet Stock Reports</h2>
            <p className="mt-1 text-sm text-amber-100/85">Click an outlet to view available outlet stock transferred from central inventory.</p>
          </div>

          <div className="p-6">

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Outlet</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {outlets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">No outlets found.</td>
                  </tr>
                ) : (
                  outlets.map((outlet) => (
                    <tr key={outlet.id} className="transition hover:bg-orange-50/35">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{outlet.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{outlet.code}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${outlet.status === 'active' ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}`}>
                          {outlet.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openStockReport(outlet)}
                          className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                        >
                          View Stock Report
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </div>

      {stockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-[0_32px_110px_-45px_rgba(194,65,12,0.6)]">
            <div className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.35),_transparent_48%),linear-gradient(130deg,_rgba(154,52,18,0.95)_0%,_rgba(234,88,12,0.94)_45%,_rgba(249,115,22,0.9)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto px-6 pb-6 pt-7 sm:px-8 sm:pb-8">
            <div className="mb-5 flex items-start justify-between gap-4 text-white">
              <div>
                <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-lg">📦</div>
                <h3 className="text-2xl font-semibold tracking-tight">
                Outlet Stock Report - {selectedOutlet?.name}
                </h3>
              </div>
              <button
                onClick={() => {
                  setStockModalOpen(false);
                  setSelectedOutlet(null);
                  setStockLines([]);
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {stockLoading ? (
              <div className="py-10 text-center text-slate-600">Loading stock report...</div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-orange-100">
                <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-100/80">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Unit</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Available Qty</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {stockLines.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">No stock transferred to this outlet yet.</td>
                      </tr>
                    ) : (
                      stockLines.map((line) => (
                        <tr key={line.inventory_item_id} className="transition hover:bg-orange-50/35">
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{line.name}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{line.code}</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{line.unit}</td>
                          <td className="px-4 py-3 text-sm text-slate-900 text-right font-semibold">{Number(line.available_quantity).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
