'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type PackagingRow = {
  id: number;
  packed_quantity: number;
  status: 'planned' | 'packed' | 'dispatched';
  label_code: string;
  barcode_value?: string | null;
  qr_value?: string | null;
  packed_at?: string | null;
  productionOrder?: {
    plan?: { order_number?: string | null; plan_date?: string | null } | null;
    product?: { code: string; name: string; unit: string } | null;
  };
};

export default function PackagingLabelsPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState<PackagingRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [statusFilter, setStatusFilter] = useState<'packed' | 'dispatched' | ''>('');
  const [search, setSearch] = useState('');

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken || storedToken === 'undefined' || storedToken === 'null') {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const loadRows = async (authToken: string) => {
    try {
      setLoading(true);
      setMessage('');

      const res = await axios.get(`${API_URL}/api/production/packaging/batches`, {
        headers: authHeaders(authToken),
        params: {
          status: statusFilter || undefined,
          search: search || undefined,
          per_page: 500,
        },
      });

      const data = res.data?.data?.data || [];
      setRows(data);

      setSelectedIds((prev) => prev.filter((id) => data.some((row: PackagingRow) => row.id === id)));
    } catch (error: any) {
      console.error('Failed to load packaging labels:', error);
      if (error?.response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
        return;
      }
      setMessage(error?.response?.data?.message || 'Failed to load packaging labels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadRows(token);
  }, [token]);

  const printableRows = useMemo(() => rows.filter((row) => selectedIds.includes(row.id)), [rows, selectedIds]);

  const allSelectableIds = useMemo(
    () => rows.filter((row) => row.status === 'packed' || row.status === 'dispatched').map((row) => row.id),
    [rows]
  );

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAll = () => {
    setSelectedIds(allSelectableIds);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const escapeHtml = (value: string) =>
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const printLabels = (targetRows: PackagingRow[]) => {
    if (targetRows.length === 0) {
      alert('Select at least one packaging batch to print labels.');
      return;
    }

    const popup = window.open('', '_blank', 'width=1024,height=768');
    if (!popup) {
      alert('Unable to open print window. Please allow popups.');
      return;
    }

    const labelsHtml = targetRows
      .map((row) => {
        const productCode = row.productionOrder?.product?.code || '-';
        const productName = row.productionOrder?.product?.name || '-';
        const unit = row.productionOrder?.product?.unit || '';
        const orderNo = row.productionOrder?.plan?.order_number || '-';
        const packedQty = Number(row.packed_quantity || 0).toFixed(3);
        const barcode = row.barcode_value || '-';
        const qr = row.qr_value || '-';
        const packedDate = row.packed_at ? new Date(row.packed_at).toLocaleString() : '-';

        return `
          <div class="label">
            <div class="header">PACKAGING LABEL</div>
            <div class="line"><strong>Label:</strong> ${escapeHtml(row.label_code)}</div>
            <div class="line"><strong>Order:</strong> ${escapeHtml(orderNo)}</div>
            <div class="line"><strong>Product:</strong> ${escapeHtml(productCode)} - ${escapeHtml(productName)}</div>
            <div class="line"><strong>Packed Qty:</strong> ${escapeHtml(packedQty)} ${escapeHtml(unit)}</div>
            <div class="line"><strong>Status:</strong> ${escapeHtml(row.status.toUpperCase())}</div>
            <div class="line"><strong>Packed At:</strong> ${escapeHtml(packedDate)}</div>
            <div class="barcode">${escapeHtml(barcode)}</div>
            <div class="qr">${escapeHtml(qr)}</div>
          </div>
        `;
      })
      .join('');

    popup.document.write(`
      <html>
        <head>
          <title>Packaging Labels</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 12px; color: #111; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
            .label { border: 1px solid #333; border-radius: 8px; padding: 10px; page-break-inside: avoid; }
            .header { font-weight: 700; font-size: 13px; margin-bottom: 8px; letter-spacing: 0.4px; }
            .line { font-size: 11px; margin: 3px 0; }
            .barcode, .qr { margin-top: 8px; font-family: 'Courier New', monospace; font-size: 10px; border: 1px dashed #666; padding: 5px; }
            @media print { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
          </style>
        </head>
        <body>
          <div class="grid">
            ${labelsHtml}
          </div>
        </body>
      </html>
    `);

    popup.document.close();
    popup.focus();
    popup.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50">
      <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Packaging Label Printing</h1>
              <p className="text-xs text-gray-600">Single and bulk label printing with order and product metadata</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/production/packaging" className="px-4 py-2 border border-rose-200 bg-rose-50 text-rose-700 rounded-md text-sm font-medium hover:bg-rose-100">Back to Packaging</Link>
              <Link href="/dashboard/production" className="px-4 py-2 border border-slate-200 bg-slate-50 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-100">Production Home</Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        {message && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>}

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'packed' | 'dispatched' | '')} className="w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none">
                <option value="">All</option>
                <option value="packed">Packed</option>
                <option value="dispatched">Dispatched</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Label code, product code/name, order" className="w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none" />
            </div>
            <button type="button" onClick={() => token && loadRows(token)} className="h-[42px] px-4 py-2 bg-gradient-to-r from-slate-600 to-gray-700 text-white rounded-md text-sm font-medium hover:from-slate-700 hover:to-gray-800">
              Apply
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={selectAll} className="px-3 py-1.5 border border-rose-200 bg-rose-50 text-rose-700 rounded-md text-xs font-medium hover:bg-rose-100">Select All Printable</button>
            <button type="button" onClick={clearSelection} className="px-3 py-1.5 border border-gray-300 bg-white text-gray-700 rounded-md text-xs font-medium hover:bg-gray-50">Clear Selection</button>
            <button type="button" onClick={() => printLabels(printableRows)} className="px-3 py-1.5 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-md text-xs font-medium hover:from-rose-700 hover:to-pink-700">Print Selected ({selectedIds.length})</button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-rose-50 to-pink-50 text-sm font-semibold text-gray-800">Packaging Labels</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Select</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Label Code</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Packed Qty</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No label records found.</td></tr>
                ) : (
                  rows.map((row) => {
                    const printable = row.status === 'packed' || row.status === 'dispatched';
                    return (
                      <tr key={row.id} className="hover:bg-rose-50/40 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            disabled={!printable}
                            checked={selectedIds.includes(row.id)}
                            onChange={() => toggleSelection(row.id)}
                          />
                        </td>
                        <td className="px-4 py-2.5 text-sm text-gray-800 font-semibold">{row.label_code}</td>
                        <td className="px-4 py-2.5 text-sm text-indigo-700">{row.productionOrder?.plan?.order_number || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{row.productionOrder?.product?.code || '-'} - {row.productionOrder?.product?.name || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-rose-700 font-semibold">{Number(row.packed_quantity || 0).toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold">
                          <span className={row.status === 'dispatched' ? 'text-indigo-700' : row.status === 'packed' ? 'text-emerald-700' : 'text-slate-700'}>{row.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={!printable}
                            onClick={() => printLabels([row])}
                            className="px-3 py-1.5 border border-rose-200 bg-rose-50 text-rose-700 rounded-md text-xs font-medium hover:bg-rose-100 disabled:opacity-50"
                          >
                            Print
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
