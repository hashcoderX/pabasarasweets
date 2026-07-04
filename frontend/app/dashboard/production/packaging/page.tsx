'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type ApprovedQcRow = {
  id: number;
  inspection_date: string;
  approved_quantity: number;
  productionOrder?: {
    id: number;
    batch_no?: string | null;
    produced_quantity: number;
    plan?: { order_number?: string | null; plan_date?: string | null; shift?: string | null } | null;
    product?: { code: string; name: string; unit: string } | null;
  };
  production_order?: {
    id: number;
    batch_no?: string | null;
    produced_quantity: number;
    plan?: { order_number?: string | null; plan_date?: string | null; shift?: string | null } | null;
    product?: { code: string; name: string; unit: string } | null;
  };
};

type PackagingRow = {
  id: number;
  qc_inspection_id: number;
  production_order_id: number;
  packaging_material_name: string;
  packaging_material_quantity: number;
  packaging_material_unit: string;
  packed_quantity: number;
  batch_no?: string | null;
  unit_price?: number | null;
  expiry_date?: string | null;
  status: 'planned' | 'packed' | 'dispatched';
  label_code: string;
  barcode_value?: string | null;
  qr_value?: string | null;
  packed_at?: string | null;
  notes?: string | null;
  productionOrder?: {
    batch_no?: string | null;
    plan?: { order_number?: string | null; plan_date?: string | null } | null;
    product?: { code: string; name: string; unit: string } | null;
  };
  production_order?: {
    batch_no?: string | null;
    plan?: { order_number?: string | null; plan_date?: string | null } | null;
    product?: { code: string; name: string; unit: string } | null;
  };
};

type PackagingSummary = {
  total_batches: number;
  planned_batches: number;
  packed_batches: number;
  dispatched_batches: number;
  total_packed_quantity: number;
};

export default function PackagingManagementPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [approvedQc, setApprovedQc] = useState<ApprovedQcRow[]>([]);
  const [rows, setRows] = useState<PackagingRow[]>([]);
  const [summary, setSummary] = useState<PackagingSummary>({
    total_batches: 0,
    planned_batches: 0,
    packed_batches: 0,
    dispatched_batches: 0,
    total_packed_quantity: 0,
  });

  const [selectedQcId, setSelectedQcId] = useState<number>(0);
  const [materialName, setMaterialName] = useState('Food Grade Wrapper');
  const [materialQty, setMaterialQty] = useState('100');
  const [materialUnit, setMaterialUnit] = useState('pcs');
  const [packedQty, setPackedQty] = useState('0');
  const [unitPrice, setUnitPrice] = useState('0');
  const [expiryDate, setExpiryDate] = useState('');
  const [packStatus, setPackStatus] = useState<'planned' | 'packed' | 'dispatched'>('planned');
  const [packNotes, setPackNotes] = useState('');

  const [updateRowId, setUpdateRowId] = useState<number>(0);
  const [updateStatus, setUpdateStatus] = useState<'planned' | 'packed' | 'dispatched'>('planned');
  const [updatePackedQty, setUpdatePackedQty] = useState('0');
  const [updateUnitPrice, setUpdateUnitPrice] = useState('0');
  const [updateExpiryDate, setUpdateExpiryDate] = useState('');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'planned' | 'packed' | 'dispatched' | ''>('');
  const [search, setSearch] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';
  const router = useRouter();
  const inputClass =
    'w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none';

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  const resolveOrder = (row: { productionOrder?: any; production_order?: any }) => row.productionOrder || row.production_order;

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken || storedToken === 'undefined' || storedToken === 'null') {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const loadData = async (authToken: string) => {
    try {
      setLoading(true);
      setMessage('');

      const [approvedRes, batchRes] = await Promise.all([
        axios.get(`${API_URL}/api/production/packaging/approved-qc-batches`, {
          headers: authHeaders(authToken),
          params: { per_page: 200 },
        }),
        axios.get(`${API_URL}/api/production/packaging/batches`, {
          headers: authHeaders(authToken),
          params: {
            from_date: fromDate || undefined,
            to_date: toDate || undefined,
            status: statusFilter || undefined,
            search: search || undefined,
            per_page: 300,
          },
        }),
      ]);

      setApprovedQc(approvedRes.data?.data?.data || []);
      setRows(batchRes.data?.data?.data || []);
      setSummary(batchRes.data?.data?.summary || {
        total_batches: 0,
        planned_batches: 0,
        packed_batches: 0,
        dispatched_batches: 0,
        total_packed_quantity: 0,
      });
    } catch (error: any) {
      console.error('Failed to load packaging data:', error);
      if (error?.response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
        return;
      }
      setMessage(error?.response?.data?.message || 'Failed to load packaging data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadData(token);
  }, [token]);

  const applyFilters = async () => {
    if (!token) return;
    await loadData(token);
  };

  const createBatch = async () => {
    if (!token) return;
    if (!selectedQcId) {
      alert('Select approved QC batch first.');
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/api/production/packaging/batches`,
        {
          qc_inspection_id: selectedQcId,
          packaging_material_name: materialName,
          packaging_material_quantity: Number(materialQty || 0),
          packaging_material_unit: materialUnit,
          packed_quantity: Number(packedQty || 0),
          unit_price: Number(unitPrice || 0),
          expiry_date: expiryDate || null,
          status: packStatus,
          notes: packNotes || null,
        },
        { headers: authHeaders(token) }
      );

      setSelectedQcId(0);
      setMaterialName('Food Grade Wrapper');
      setMaterialQty('100');
      setMaterialUnit('pcs');
      setPackedQty('0');
      setUnitPrice('0');
      setExpiryDate('');
      setPackStatus('planned');
      setPackNotes('');
      setMessage('Packaging batch created successfully. Label, barcode and QR generated.');
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to create packaging batch.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      alert(firstError?.[0] || apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const updateBatch = async () => {
    if (!token) return;
    if (!updateRowId) {
      alert('Select a packaging batch first.');
      return;
    }

    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/api/production/packaging/batches/${updateRowId}`,
        {
          status: updateStatus,
          packed_quantity: Number(updatePackedQty || 0),
          unit_price: Number(updateUnitPrice || 0),
          expiry_date: updateExpiryDate || null,
        },
        { headers: authHeaders(token) }
      );

      setMessage('Packaging batch updated successfully.');
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to update packaging batch.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      alert(firstError?.[0] || apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      alert('No packaging rows to export.');
      return;
    }

    const headers = [
      'Batch ID',
      'Batch No',
      'Order Number',
      'Product Code',
      'Product Name',
      'Packaging Material',
      'Material Qty',
      'Packed Qty',
      'Unit Price',
      'Expiry Date',
      'Status',
      'Label Code',
      'Barcode',
      'QR',
      'Packed At',
      'Notes',
    ];

    const data = rows.map((row) => {
      const order = resolveOrder(row);
      return [
        row.id,
        row.batch_no || order?.batch_no || '',
        order?.plan?.order_number || '',
        order?.product?.code || '',
        order?.product?.name || '',
        row.packaging_material_name,
        `${Number(row.packaging_material_quantity || 0).toFixed(3)} ${row.packaging_material_unit || ''}`,
        Number(row.packed_quantity || 0).toFixed(3),
        Number(row.unit_price || 0).toFixed(2),
        row.expiry_date || '',
        row.status,
        row.label_code || '',
        row.barcode_value || '',
        row.qr_value || '',
        row.packed_at || '',
        row.notes || '',
      ];
    });

    const csv = [headers, ...data]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `packaging_report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Packaging Management</h1>
              <p className="text-xs text-gray-600">Packaging material tracking, label/barcode/QR generation and packed quantity tracking</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/production" className="px-4 py-2 border border-rose-200 bg-rose-50 text-rose-700 rounded-md text-sm font-medium hover:bg-rose-100">Back to Production</Link>
              <Link href="/dashboard/production/packaging/labels" className="px-4 py-2 border border-pink-200 bg-pink-50 text-pink-700 rounded-md text-sm font-medium hover:bg-pink-100">Print Labels</Link>
              <button onClick={handleLogout} className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-5 py-2 rounded-full text-sm font-medium">Logout</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        {message && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Total Packaging Batches</div><div className="text-2xl font-bold text-gray-900">{summary.total_batches}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Planned</div><div className="text-2xl font-bold text-slate-700">{summary.planned_batches}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Packed</div><div className="text-2xl font-bold text-emerald-700">{summary.packed_batches}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Dispatched</div><div className="text-2xl font-bold text-indigo-700">{summary.dispatched_batches}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Total Packed Qty</div><div className="text-2xl font-bold text-gray-900">{Number(summary.total_packed_quantity || 0).toFixed(3)}</div></div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Packaging Batch</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Approved QC Batch</label>
                <select value={selectedQcId} onChange={(e) => setSelectedQcId(Number(e.target.value))} className={inputClass}>
                  <option value={0}>Select approved QC batch</option>
                  {approvedQc.map((qc) => (
                    (() => {
                      const order = resolveOrder(qc);
                      return (
                    <option key={qc.id} value={qc.id}>
                      QC #{qc.id} | {order?.batch_no || '-'} | {order?.product?.code || '-'} - {order?.product?.name || '-'} | Approved {Number(qc.approved_quantity || 0).toFixed(3)}
                    </option>
                      );
                    })()
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Packaging Material</label>
                <input value={materialName} onChange={(e) => setMaterialName(e.target.value)} className={inputClass} placeholder="Wrapper / Box" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Material Quantity</label>
                <input type="number" min="0" step="0.001" value={materialQty} onChange={(e) => setMaterialQty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Material Unit</label>
                <input value={materialUnit} onChange={(e) => setMaterialUnit(e.target.value)} className={inputClass} placeholder="pcs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Packed Quantity</label>
                <input type="number" min="0" step="0.001" value={packedQty} onChange={(e) => setPackedQty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price (LKR)</label>
                <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
                <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Packaging Status</label>
                <select value={packStatus} onChange={(e) => setPackStatus(e.target.value as 'planned' | 'packed' | 'dispatched')} className={inputClass}>
                  <option value="planned">Planned</option>
                  <option value="packed">Packed</option>
                  <option value="dispatched">Dispatched</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <input value={packNotes} onChange={(e) => setPackNotes(e.target.value)} className={inputClass} placeholder="Optional notes" />
              </div>
            </div>

            <button type="button" disabled={saving} onClick={createBatch} className="mt-4 px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 text-white rounded-md text-sm font-medium hover:from-rose-700 hover:to-pink-700 disabled:opacity-50">Save Packaging Batch</button>
          </section>

          <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Update Packed Quantity / Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Packaging Batch</label>
                <select
                  value={updateRowId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setUpdateRowId(id);
                    const row = rows.find((x) => x.id === id);
                    if (row) {
                      setUpdateStatus(row.status);
                      setUpdatePackedQty(String(row.packed_quantity ?? 0));
                      setUpdateUnitPrice(String(row.unit_price ?? 0));
                      setUpdateExpiryDate(row.expiry_date ? String(row.expiry_date).slice(0, 10) : '');
                    }
                  }}
                  className={inputClass}
                >
                  <option value={0}>Select packaging batch</option>
                  {rows.map((row) => (
                    (() => {
                      const order = resolveOrder(row);
                      return (
                        <option key={row.id} value={row.id}>#{row.id} | {row.batch_no || order?.batch_no || '-'} | {order?.product?.code || '-'} - {order?.product?.name || '-'} | {row.label_code}</option>
                      );
                    })()
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value as 'planned' | 'packed' | 'dispatched')} className={inputClass}>
                  <option value="planned">Planned</option>
                  <option value="packed">Packed</option>
                  <option value="dispatched">Dispatched</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Packed Quantity</label>
                <input type="number" min="0" step="0.001" value={updatePackedQty} onChange={(e) => setUpdatePackedQty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price (LKR)</label>
                <input type="number" min="0" step="0.01" value={updateUnitPrice} onChange={(e) => setUpdateUnitPrice(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
                <input type="date" value={updateExpiryDate} onChange={(e) => setUpdateExpiryDate(e.target.value)} className={inputClass} />
              </div>
            </div>

            <button type="button" disabled={saving} onClick={updateBatch} className="mt-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50">Update Packaging Batch</button>

            <div className="mt-6 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Filters</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'planned' | 'packed' | 'dispatched' | '')} className={inputClass}>
                    <option value="">All</option>
                    <option value="planned">Planned</option>
                    <option value="packed">Packed</option>
                    <option value="dispatched">Dispatched</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputClass} placeholder="Label/Product/Barcode" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={applyFilters} className="px-4 py-2 bg-gradient-to-r from-slate-600 to-gray-700 text-white rounded-md text-sm font-medium hover:from-slate-700 hover:to-gray-800">Apply Filters</button>
                <button type="button" onClick={exportCsv} className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-md text-sm font-medium hover:bg-slate-50">Download CSV</button>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-rose-50 to-pink-50 text-sm font-semibold text-gray-800">Packaging Batches</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch No</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Packed Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barcode / QR</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500">No packaging batches found.</td></tr>
                ) : (
                  rows.map((row) => {
                    const order = resolveOrder(row);
                    return (
                      <tr key={row.id} className="hover:bg-rose-50/40 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">#{row.id}</td>
                        <td className="px-4 py-2.5 text-xs text-indigo-700 font-semibold">{row.batch_no || order?.batch_no || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-indigo-700">{order?.plan?.order_number || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{order?.product?.code || '-'} - {order?.product?.name || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{row.packaging_material_name} ({Number(row.packaging_material_quantity || 0).toFixed(3)} {row.packaging_material_unit})</td>
                        <td className="px-4 py-2.5 text-sm text-right text-rose-700 font-semibold">{Number(row.packed_quantity || 0).toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-700">LKR {Number(row.unit_price || 0).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-700">{row.expiry_date ? String(row.expiry_date).slice(0, 10) : '-'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 font-semibold">{row.label_code}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">BAR: {row.barcode_value || '-'}<br />QR: {row.qr_value || '-'}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold">
                          <span className={row.status === 'dispatched' ? 'text-indigo-700' : row.status === 'packed' ? 'text-emerald-700' : 'text-slate-700'}>{row.status}</span>
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
