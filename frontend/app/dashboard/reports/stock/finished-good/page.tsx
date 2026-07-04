'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type InventoryRow = {
  id: number;
  code?: string;
  name?: string;
  category?: string;
  unit?: string;
  current_stock?: number;
  minimum_stock?: number;
  maximum_stock?: number;
  unit_price?: number;
  status?: 'active' | 'inactive';
};

type Paginated<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function FinishedGoodStockReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [errorMessage, setErrorMessage] = useState('');

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

  useEffect(() => {
    if (!token) return;
    const boot = async () => {
      try {
        await fetchRows(token);
      } finally {
        setAccessReady(true);
      }
    };
    boot();
  }, [token]);

  const fetchRows = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      setLoading(true);
      setErrorMessage('');

      const allRows: InventoryRow[] = [];
      let nextUrl: string | null = `${API_URL}/api/stock/inventory?per_page=200&type=finished_good`;
      let pageCount = 0;

      while (nextUrl && pageCount < 50) {
        const response: { data: { data?: Paginated<InventoryRow> } } = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        });

        const payload = response.data?.data;
        allRows.push(...(Array.isArray(payload?.data) ? payload.data : []));
        nextUrl = payload?.next_page_url || null;
        pageCount += 1;
      }

      setRows(allRows);
    } catch (error) {
      console.error('Error loading finished goods report:', error);
      setRows([]);
      setErrorMessage('Failed to load finished goods stock report.');
    } finally {
      setLoading(false);
    }
  };

  const isLow = (r: InventoryRow) => Number(r.current_stock || 0) <= Number(r.minimum_stock || 0);
  const isOut = (r: InventoryRow) => Number(r.current_stock || 0) <= 0;

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (stockFilter === 'low' && !isLow(r)) return false;
      if (stockFilter === 'out' && !isOut(r)) return false;
      if (!term) return true;
      return [r.code, r.name, r.category].map((v) => String(v || '').toLowerCase()).join(' ').includes(term);
    });
  }, [rows, search, stockFilter]);

  const summary = useMemo(() => ({
    total: filteredRows.length,
    low: filteredRows.filter(isLow).length,
    out: filteredRows.filter(isOut).length,
  }), [filteredRows]);

  const qty = (n?: number) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rowToExport = (r: InventoryRow) => [r.code || '-', r.name || '-', r.category || '-', qty(r.current_stock), qty(r.minimum_stock), qty(r.maximum_stock), r.unit || '-'];

  const exportCsv = () => {
    const headers = ['Code', 'Item', 'Category', 'Current', 'Min', 'Max', 'Unit'];
    const csv = [headers, ...filteredRows.map(rowToExport)].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finished-good-stock-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Finished Good Stock Report', 40, 40);
    autoTable(doc, {
      startY: 60,
      head: [['Code', 'Item', 'Category', 'Current', 'Min', 'Max', 'Unit']],
      body: filteredRows.map(rowToExport),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235] },
      margin: { left: 20, right: 20 },
    });
    return doc;
  };

  if (!token || !accessReady) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50">
      <nav className="bg-white/80 backdrop-blur-lg shadow border-b border-white/20"><div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between"><Link href="/dashboard/reports" className="text-black hover:text-blue-600">Back to Reports</Link><span className="text-sm text-black">Finished Goods Report</span></div></nav>
      <main className="max-w-7xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-black mb-2">Finished Good Stock Report</h1>
        <p className="text-black mb-6">Finished goods availability and stock-risk overview.</p>
        {errorMessage && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, item, category" className="md:col-span-2 rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as any)} className="rounded-md border border-gray-300 text-sm text-black px-2 py-2"><option value="all">All Levels</option><option value="low">Low Stock</option><option value="out">Out of Stock</option></select>
            <button onClick={() => fetchRows()} disabled={loading} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-md text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Loading...' : 'Refresh Data'}</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => window.open(buildPdf().output('bloburl'), '_blank')} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700">View PDF</button>
            <button onClick={() => buildPdf().save(`finished-good-stock-report-${new Date().toISOString().split('T')[0]}.pdf`)} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700">Download PDF</button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-orange-200 bg-orange-50 text-orange-700">Download CSV (Excel)</button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/95 shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-blue-50 flex flex-wrap gap-3 text-sm text-black"><span>Total: <strong>{summary.total}</strong></span><span>Low: <strong>{summary.low}</strong></span><span>Out: <strong>{summary.out}</strong></span></div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Code</th><th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Item</th><th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Category</th><th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Current</th><th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Min</th><th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Max</th></tr></thead>
              <tbody className="bg-white divide-y divide-gray-100">{filteredRows.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-black">No finished goods found.</td></tr> : filteredRows.map((r, i) => <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}><td className="px-4 py-3 text-sm text-black">{r.code || '-'}</td><td className="px-4 py-3 text-sm text-black font-medium">{r.name || '-'}</td><td className="px-4 py-3 text-sm text-black">{r.category || '-'}</td><td className="px-4 py-3 text-sm text-black text-right">{qty(r.current_stock)}</td><td className="px-4 py-3 text-sm text-black text-right">{qty(r.minimum_stock)}</td><td className="px-4 py-3 text-sm text-black text-right">{qty(r.maximum_stock)}</td></tr>)}</tbody></table>
          </div>
        </section>
      </main>
    </div>
  );
}
