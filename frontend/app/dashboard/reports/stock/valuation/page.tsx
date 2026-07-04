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
  type?: 'raw_material' | 'finished_good';
  current_stock?: number;
  unit_price?: number;
  status?: 'active' | 'inactive';
};

type Paginated<T> = {
  data?: T[];
  next_page_url?: string | null;
};

export default function FullStockValuationReportPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'raw_material' | 'finished_good'>('all');
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
      let nextUrl: string | null = `${API_URL}/api/stock/inventory?per_page=200`;
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
      console.error('Error loading stock valuation report:', error);
      setRows([]);
      setErrorMessage('Failed to load stock valuation report.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (!term) return true;
      return [r.code, r.name, r.category].map((v) => String(v || '').toLowerCase()).join(' ').includes(term);
    });
  }, [rows, search, typeFilter]);

  const withValues = useMemo(() => filteredRows.map((r) => ({ ...r, stock_value: Number(r.current_stock || 0) * Number(r.unit_price || 0) })), [filteredRows]);

  const summary = useMemo(() => {
    const totalItems = withValues.length;
    const totalValue = withValues.reduce((sum, r) => sum + r.stock_value, 0);
    const rawValue = withValues.filter((r) => r.type === 'raw_material').reduce((sum, r) => sum + r.stock_value, 0);
    const finishedValue = withValues.filter((r) => r.type === 'finished_good').reduce((sum, r) => sum + r.stock_value, 0);
    return { totalItems, totalValue, rawValue, finishedValue };
  }, [withValues]);

  const fmt = (n?: number) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toType = (v?: string) => (v ? v.replace('_', ' ').toUpperCase() : '-');
  const rowToExport = (r: any) => [r.code || '-', r.name || '-', toType(r.type), r.category || '-', fmt(r.current_stock), fmt(r.unit_price), fmt(r.stock_value)];

  const exportCsv = () => {
    const headers = ['Code', 'Item', 'Type', 'Category', 'Stock Qty', 'Unit Price', 'Stock Value'];
    const csv = [headers, ...withValues.map(rowToExport)].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `full-stock-valuation-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const buildPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text('Full Stock Valuation Report', 40, 40);
    autoTable(doc, {
      startY: 60,
      head: [['Code', 'Item', 'Type', 'Category', 'Stock Qty', 'Unit Price', 'Stock Value']],
      body: withValues.map(rowToExport),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [190, 24, 93] },
      margin: { left: 20, right: 20 },
      didDrawPage: () => {
        doc.setFontSize(9);
        doc.text(`Summary - Items: ${summary.totalItems}, Total: ${fmt(summary.totalValue)}, Raw: ${fmt(summary.rawValue)}, Finished: ${fmt(summary.finishedValue)}`, 20, doc.internal.pageSize.getHeight() - 20);
      },
    });
    return doc;
  };

  if (!token || !accessReady) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-600"></div></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-red-50">
      <nav className="bg-white/80 backdrop-blur-lg shadow border-b border-white/20"><div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between"><Link href="/dashboard/reports" className="text-black hover:text-pink-600">Back to Reports</Link><span className="text-sm text-black">Stock Valuation Report</span></div></nav>
      <main className="max-w-7xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-black mb-2">Full Stock Valuation Report</h1>
        <p className="text-black mb-6">Inventory value by item and overall totals.</p>
        {errorMessage && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, item, category" className="md:col-span-2 rounded-md border border-gray-300 text-sm text-black px-2 py-2" />
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)} className="rounded-md border border-gray-300 text-sm text-black px-2 py-2"><option value="all">All Types</option><option value="raw_material">Raw Material</option><option value="finished_good">Finished Good</option></select>
            <button onClick={() => fetchRows()} disabled={loading} className="px-4 py-2 bg-gradient-to-r from-pink-600 to-red-600 rounded-md text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Loading...' : 'Refresh Data'}</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => window.open(buildPdf().output('bloburl'), '_blank')} className="px-4 py-2 rounded-md text-sm font-medium border border-blue-200 bg-blue-50 text-blue-700">View PDF</button>
            <button onClick={() => buildPdf().save(`full-stock-valuation-report-${new Date().toISOString().split('T')[0]}.pdf`)} className="px-4 py-2 rounded-md text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-700">Download PDF</button>
            <button onClick={exportCsv} className="px-4 py-2 rounded-md text-sm font-medium border border-orange-200 bg-orange-50 text-orange-700">Download CSV (Excel)</button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/95 shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-pink-50 flex flex-wrap gap-3 text-sm text-black"><span>Items: <strong>{summary.totalItems}</strong></span><span>Total Value: <strong>{fmt(summary.totalValue)}</strong></span><span>Raw Value: <strong>{fmt(summary.rawValue)}</strong></span><span>Finished Value: <strong>{fmt(summary.finishedValue)}</strong></span></div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Code</th><th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Item</th><th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Type</th><th className="px-4 py-3 text-left text-xs font-medium text-black uppercase">Category</th><th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Qty</th><th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Unit Price</th><th className="px-4 py-3 text-right text-xs font-medium text-black uppercase">Value</th></tr></thead>
              <tbody className="bg-white divide-y divide-gray-100">{withValues.length === 0 ? <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-black">No valuation records found.</td></tr> : withValues.map((r, i) => <tr key={r.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}><td className="px-4 py-3 text-sm text-black">{r.code || '-'}</td><td className="px-4 py-3 text-sm text-black font-medium">{r.name || '-'}</td><td className="px-4 py-3 text-sm text-black">{toType(r.type)}</td><td className="px-4 py-3 text-sm text-black">{r.category || '-'}</td><td className="px-4 py-3 text-sm text-black text-right">{fmt(r.current_stock)}</td><td className="px-4 py-3 text-sm text-black text-right">{fmt(r.unit_price)}</td><td className="px-4 py-3 text-sm text-black font-semibold text-right">{fmt(r.stock_value)}</td></tr>)}</tbody></table>
          </div>
        </section>
      </main>
    </div>
  );
}
