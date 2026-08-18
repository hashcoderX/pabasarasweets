'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type ApprovedQcRow = {
  id: number;
  inspection_date: string;
  approved_quantity: number;
  packed_quantity_total?: number;
  balance_quantity?: number;
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
  final_product_name?: string | null;
  materials?: Array<{
    id?: number;
    raw_material_id: number;
    inventory_item_id?: number;
    material_name?: string;
    material_code?: string;
    material_unit?: string;
    quantity_per_pack: number;
    consumed_quantity?: number;
  }>;
  packaging_material_name: string;
  packaging_material_quantity: number;
  packaging_material_unit: string;
  packed_quantity: number;
  batch_no?: string | null;
  unit_price?: number | null;
  selling_price?: number | null;
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

type RawMaterialOption = {
  id: number;
  inventoryItem?: {
    id: number;
    code: string;
    name: string;
    unit: string;
    current_stock: number;
  };
  inventory_item?: {
    id: number;
    code: string;
    name: string;
    unit: string;
    current_stock: number;
  };
};

type PackagingMaterialLine = {
  raw_material_id: number;
  quantity_per_pack: string;
};

type PackagingSummary = {
  total_batches: number;
  planned_batches: number;
  packed_batches: number;
  dispatched_batches: number;
  total_packed_quantity: number;
};

type AppModalState = {
  variant: 'alert' | 'confirm';
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
};

export default function PackagingManagementPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState(0);
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState<AppModalState | null>(null);

  const [approvedQc, setApprovedQc] = useState<ApprovedQcRow[]>([]);
  const [rawMaterialOptions, setRawMaterialOptions] = useState<RawMaterialOption[]>([]);
  const [rows, setRows] = useState<PackagingRow[]>([]);
  const [summary, setSummary] = useState<PackagingSummary>({
    total_batches: 0,
    planned_batches: 0,
    packed_batches: 0,
    dispatched_batches: 0,
    total_packed_quantity: 0,
  });

  const [selectedQcId, setSelectedQcId] = useState<number>(0);
  const [finalProductName, setFinalProductName] = useState('');
  const [materialQty, setMaterialQty] = useState('100');
  const [materialUnit, setMaterialUnit] = useState('pcs');
  const [packedQty, setPackedQty] = useState('0');
  const [costingPrice, setCostingPrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [expiryDate, setExpiryDate] = useState('');
  const [packStatus, setPackStatus] = useState<'planned' | 'packed' | 'dispatched'>('planned');
  const [packNotes, setPackNotes] = useState('');
  const [createMaterialLines, setCreateMaterialLines] = useState<PackagingMaterialLine[]>([
    { raw_material_id: 0, quantity_per_pack: '1' },
  ]);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetQcId, setTransferTargetQcId] = useState<number>(0);
  const [transferQuantity, setTransferQuantity] = useState('0');
  const [transferSaving, setTransferSaving] = useState(false);

  const [updateRowId, setUpdateRowId] = useState<number>(0);
  const [updateFinalProductName, setUpdateFinalProductName] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'planned' | 'packed' | 'dispatched'>('planned');
  const [updatePackedQty, setUpdatePackedQty] = useState('0');
  const [updateCostingPrice, setUpdateCostingPrice] = useState('0');
  const [updateSellingPrice, setUpdateSellingPrice] = useState('0');
  const [updateExpiryDate, setUpdateExpiryDate] = useState('');
  const [updateMaterialLines, setUpdateMaterialLines] = useState<PackagingMaterialLine[]>([
    { raw_material_id: 0, quantity_per_pack: '1' },
  ]);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'planned' | 'packed' | 'dispatched' | ''>('');
  const [search, setSearch] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  const router = useRouter();
  const inputClass =
    'w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none';

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  const resolveOrder = (row: { productionOrder?: any; production_order?: any }) => row.productionOrder || row.production_order;
  const extractList = (payload: any) => {
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload)) return payload;
    return [];
  };
  const showAlertModal = (text: string, title = 'Alert') => {
    setModal({ variant: 'alert', title, message: text, confirmLabel: 'OK' });
  };
  const showConfirmModal = (text: string, onConfirm: () => void | Promise<void>, title = 'Confirm Action') => {
    setModal({
      variant: 'confirm',
      title,
      message: text,
      confirmLabel: 'Yes',
      cancelLabel: 'Cancel',
      onConfirm,
    });
  };
  const closeModal = () => setModal(null);
  const handleModalConfirm = async () => {
    const action = modal?.onConfirm;
    setModal(null);
    if (action) {
      await action();
    }
  };

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

      const [approvedRes, batchRes, rawRes] = await Promise.all([
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
        axios.get(`${API_URL}/api/production/raw-materials`, {
          headers: authHeaders(authToken),
        }),
      ]);

      setApprovedQc(extractList(approvedRes.data));
      setRows(extractList(batchRes.data));
      setRawMaterialOptions(extractList(rawRes.data));
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

  const resolveRawInventory = (raw: RawMaterialOption) => raw.inventoryItem || raw.inventory_item;

  const normalizeMaterialLines = (lines: PackagingMaterialLine[]) => {
    return lines
      .map((line) => ({
        raw_material_id: Number(line.raw_material_id || 0),
        quantity_per_pack: Number(line.quantity_per_pack || 0),
      }))
      .filter((line) => line.raw_material_id > 0 && line.quantity_per_pack > 0);
  };

  const addCreateMaterialLine = () => {
    setCreateMaterialLines((prev) => [...prev, { raw_material_id: 0, quantity_per_pack: '1' }]);
  };

  const removeCreateMaterialLine = (idx: number) => {
    setCreateMaterialLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCreateMaterialLine = (idx: number, patch: Partial<PackagingMaterialLine>) => {
    setCreateMaterialLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  };

  const addUpdateMaterialLine = () => {
    setUpdateMaterialLines((prev) => [...prev, { raw_material_id: 0, quantity_per_pack: '1' }]);
  };

  const removeUpdateMaterialLine = (idx: number) => {
    setUpdateMaterialLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateUpdateMaterialLine = (idx: number, patch: Partial<PackagingMaterialLine>) => {
    setUpdateMaterialLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  };

  useEffect(() => {
    if (!selectedQcId) return;
    if (finalProductName.trim()) return;

    const selectedQc = approvedQc.find((qc) => qc.id === selectedQcId);
    const order = selectedQc ? resolveOrder(selectedQc) : null;
    const baseName = String(order?.product?.name || '').trim();
    if (baseName) {
      setFinalProductName(baseName);
    }
  }, [selectedQcId, approvedQc, finalProductName]);

  const selectedQc = approvedQc.find((qc) => qc.id === selectedQcId) || null;
  const selectedQcBalance = Number(selectedQc?.balance_quantity ?? selectedQc?.approved_quantity ?? 0);
  const transferTargetOptions = approvedQc.filter((qc) => qc.id !== selectedQcId);

  const openTransferModal = () => {
    if (!selectedQcId) {
      showAlertModal('Select approved QC batch first.');
      return;
    }

    if (selectedQcBalance <= 0) {
      showAlertModal('Selected QC batch has no transferable balance.');
      return;
    }

    if (transferTargetOptions.length === 0) {
      showAlertModal('No target QC batch available for transfer.');
      return;
    }

    setTransferTargetQcId(transferTargetOptions[0].id);
    setTransferQuantity(selectedQcBalance.toFixed(3));
    setShowTransferModal(true);
  };

  const closeTransferModal = () => {
    setShowTransferModal(false);
    setTransferTargetQcId(0);
    setTransferQuantity('0');
    setTransferSaving(false);
  };

  const submitTransferBalance = async () => {
    if (!token) return;
    if (!selectedQcId) {
      showAlertModal('Select approved QC batch first.');
      return;
    }
    if (!transferTargetQcId) {
      showAlertModal('Select target QC batch.');
      return;
    }

    const qty = Number(transferQuantity || 0);
    if (qty <= 0) {
      showAlertModal('Transfer quantity must be greater than zero.');
      return;
    }

    try {
      setTransferSaving(true);
      await axios.post(
        `${API_URL}/api/production/packaging/transfer-qc-balance`,
        {
          source_qc_inspection_id: selectedQcId,
          target_qc_inspection_id: transferTargetQcId,
          transfer_quantity: qty,
        },
        { headers: authHeaders(token) }
      );

      closeTransferModal();
      setMessage('QC balance transferred successfully.');
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to transfer QC balance.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      showAlertModal(firstError?.[0] || apiMessage);
    } finally {
      setTransferSaving(false);
    }
  };

  const applyFilters = async () => {
    if (!token) return;
    await loadData(token);
  };

  const createBatch = async () => {
    if (!token) return;
    if (!selectedQcId) {
      showAlertModal('Select approved QC batch first.');
      return;
    }
    if (!finalProductName.trim()) {
      showAlertModal('Enter final finished product name (e.g. Sesame Ball 100).');
      return;
    }

    const materialsPayload = normalizeMaterialLines(createMaterialLines);
    if (materialsPayload.length === 0) {
      showAlertModal('Add at least one packaging raw material from raw material store.');
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/api/production/packaging/batches`,
        {
          qc_inspection_id: selectedQcId,
          final_product_name: finalProductName,
          materials: materialsPayload,
          packaging_material_quantity: Number(materialQty || 0),
          packaging_material_unit: materialUnit,
          packed_quantity: Number(packedQty || 0),
          unit_price: Number(costingPrice || 0),
          selling_price: Number(sellingPrice || 0),
          expiry_date: expiryDate || null,
          status: packStatus,
          notes: packNotes || null,
        },
        { headers: authHeaders(token) }
      );

      setSelectedQcId(0);
      setFinalProductName('');
      setMaterialQty('100');
      setMaterialUnit('pcs');
      setPackedQty('0');
      setCostingPrice('0');
      setSellingPrice('0');
      setExpiryDate('');
      setPackStatus('planned');
      setPackNotes('');
      setCreateMaterialLines([{ raw_material_id: 0, quantity_per_pack: '1' }]);
      setMessage('Packaging batch created successfully. Label, barcode and QR generated.');
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to create packaging batch.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      showAlertModal(firstError?.[0] || apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const updateBatch = async () => {
    if (!token) return;
    if (!updateRowId) {
      showAlertModal('Select a packaging batch first.');
      return;
    }
    if (!updateFinalProductName.trim()) {
      showAlertModal('Enter final finished product name.');
      return;
    }

    const materialsPayload = normalizeMaterialLines(updateMaterialLines);
    if (materialsPayload.length === 0) {
      showAlertModal('Add at least one packaging raw material from raw material store.');
      return;
    }

    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/api/production/packaging/batches/${updateRowId}`,
        {
          final_product_name: updateFinalProductName,
          materials: materialsPayload,
          status: updateStatus,
          packed_quantity: Number(updatePackedQty || 0),
          unit_price: Number(updateCostingPrice || 0),
          selling_price: Number(updateSellingPrice || 0),
          expiry_date: updateExpiryDate || null,
        },
        { headers: authHeaders(token) }
      );

      setMessage('Packaging batch updated successfully.');
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to update packaging batch.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      showAlertModal(firstError?.[0] || apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const executeBatchRemoval = async (row: PackagingRow) => {
    if (!token) return;

    try {
      setDeletingBatchId(row.id);
      await axios.delete(`${API_URL}/api/production/packaging/batches/${row.id}`, {
        headers: authHeaders(token),
      });

      if (updateRowId === row.id) {
        setUpdateRowId(0);
        setUpdateFinalProductName('');
        setUpdateStatus('planned');
        setUpdatePackedQty('0');
        setUpdateCostingPrice('0');
        setUpdateSellingPrice('0');
        setUpdateExpiryDate('');
        setUpdateMaterialLines([{ raw_material_id: 0, quantity_per_pack: '1' }]);
      }

      setMessage('Packaging batch removed successfully. Quantities were rolled back.');
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to remove packaging batch.';
      showAlertModal(apiMessage);
    } finally {
      setDeletingBatchId(0);
    }
  };

  const removeBatch = async (row: PackagingRow) => {
    if (!token) return;

    showConfirmModal(
      `Remove packaging batch #${row.id}? This will rollback packed stock/material deductions for this batch.`,
      async () => {
        await executeBatchRemoval(row);
      },
      'Remove Packaging Batch'
    );
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      showAlertModal('No packaging rows to export.');
      return;
    }

    const headers = [
      'Batch ID',
      'Batch No',
      'Order Number',
      'Product Code',
      'Product Name',
      'Final Product Name',
      'Packaging Material',
      'Material Qty',
      'Packed Qty',
      'Costing Price',
      'Selling Price',
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
        row.final_product_name || '',
        row.packaging_material_name,
        `${Number(row.packaging_material_quantity || 0).toFixed(3)} ${row.packaging_material_unit || ''}`,
        Number(row.packed_quantity || 0).toFixed(3),
        Number(row.unit_price || 0).toFixed(2),
        Number(row.selling_price || 0).toFixed(2),
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
            <p className="text-xs text-gray-500 mb-3">
              Final sellable SKUs are created here. Example: sesame ball 200 packet / 400 packet.
            </p>
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
                      QC #{qc.id} | {order?.batch_no || '-'} | {order?.product?.code || '-'} - {order?.product?.name || '-'} | Approved {Number(qc.approved_quantity || 0).toFixed(3)} | Balance {Number(qc.balance_quantity ?? qc.approved_quantity ?? 0).toFixed(3)}
                    </option>
                      );
                    })()
                  ))}
                </select>
                {selectedQc && (
                  <div className="mt-2 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Balance: <span className="font-semibold">{selectedQcBalance.toFixed(3)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={openTransferModal}
                      className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      Transfer Balance to Other QC Batch
                    </button>
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Final Finished Product Name</label>
                <input value={finalProductName} onChange={(e) => setFinalProductName(e.target.value)} className={inputClass} placeholder="e.g. Sesame Ball 100" />
                <p className="mt-1 text-[11px] text-gray-500">This name will be saved as the finished-good name in inventory.</p>
              </div>
              <div className="md:col-span-2 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-700">Packaging Raw Materials (from Raw Material Store)</label>
                  <button
                    type="button"
                    onClick={addCreateMaterialLine}
                    className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    + Add Material
                  </button>
                </div>
                <div className="space-y-2">
                  {createMaterialLines.map((line, idx) => (
                    <div key={`create-mat-${idx}`} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-7">
                        <select
                          value={line.raw_material_id}
                          onChange={(e) => updateCreateMaterialLine(idx, { raw_material_id: Number(e.target.value) })}
                          className={inputClass}
                        >
                          <option value={0}>Select raw material</option>
                          {rawMaterialOptions.map((raw) => {
                            const inv = resolveRawInventory(raw);
                            return (
                              <option key={raw.id} value={raw.id}>
                                {inv?.code || '-'} - {inv?.name || `Material #${raw.id}`} (Stock: {Number(inv?.current_stock || 0).toFixed(2)} {inv?.unit || ''})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.quantity_per_pack}
                          onChange={(e) => updateCreateMaterialLine(idx, { quantity_per_pack: e.target.value })}
                          className={inputClass}
                          placeholder="Qty per pack"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          disabled={createMaterialLines.length === 1}
                          onClick={() => removeCreateMaterialLine(idx)}
                          className="rounded-md border border-red-200 bg-white px-2 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">Example: for 1 packet -&gt; Polythene qty 1, Label qty 1.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pack Size Quantity</label>
                <input type="number" min="0" step="0.001" value={materialQty} onChange={(e) => setMaterialQty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pack Size Unit</label>
                <input value={materialUnit} onChange={(e) => setMaterialUnit(e.target.value)} className={inputClass} placeholder="packet / g / ml" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Packed Quantity</label>
                <input type="number" min="0" step="0.001" value={packedQty} onChange={(e) => setPackedQty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Costing Price (LKR)</label>
                <input type="number" min="0" step="0.01" value={costingPrice} onChange={(e) => setCostingPrice(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Selling Price (LKR)</label>
                <input type="number" min="0" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className={inputClass} />
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
                      setUpdateFinalProductName(row.final_product_name || '');
                      setUpdateStatus(row.status);
                      setUpdatePackedQty(String(row.packed_quantity ?? 0));
                      setUpdateCostingPrice(String(row.unit_price ?? 0));
                      setUpdateSellingPrice(String(row.selling_price ?? 0));
                      setUpdateExpiryDate(row.expiry_date ? String(row.expiry_date).slice(0, 10) : '');
                      if (Array.isArray(row.materials) && row.materials.length > 0) {
                        setUpdateMaterialLines(
                          row.materials.map((mat) => ({
                            raw_material_id: Number(mat.raw_material_id || 0),
                            quantity_per_pack: String(Number(mat.quantity_per_pack || 0)),
                          }))
                        );
                      } else {
                        setUpdateMaterialLines([{ raw_material_id: 0, quantity_per_pack: '1' }]);
                      }
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
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Final Finished Product Name</label>
                <input value={updateFinalProductName} onChange={(e) => setUpdateFinalProductName(e.target.value)} className={inputClass} placeholder="e.g. Sesame Ball 100" />
              </div>
              <div className="md:col-span-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-700">Packaging Raw Materials (from Raw Material Store)</label>
                  <button
                    type="button"
                    onClick={addUpdateMaterialLine}
                    className="rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    + Add Material
                  </button>
                </div>
                <div className="space-y-2">
                  {updateMaterialLines.map((line, idx) => (
                    <div key={`update-mat-${idx}`} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-7">
                        <select
                          value={line.raw_material_id}
                          onChange={(e) => updateUpdateMaterialLine(idx, { raw_material_id: Number(e.target.value) })}
                          className={inputClass}
                        >
                          <option value={0}>Select raw material</option>
                          {rawMaterialOptions.map((raw) => {
                            const inv = resolveRawInventory(raw);
                            return (
                              <option key={raw.id} value={raw.id}>
                                {inv?.code || '-'} - {inv?.name || `Material #${raw.id}`} (Stock: {Number(inv?.current_stock || 0).toFixed(2)} {inv?.unit || ''})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.quantity_per_pack}
                          onChange={(e) => updateUpdateMaterialLine(idx, { quantity_per_pack: e.target.value })}
                          className={inputClass}
                          placeholder="Qty per pack"
                        />
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          disabled={updateMaterialLines.length === 1}
                          onClick={() => removeUpdateMaterialLine(idx)}
                          className="rounded-md border border-red-200 bg-white px-2 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Costing Price (LKR)</label>
                <input type="number" min="0" step="0.01" value={updateCostingPrice} onChange={(e) => setUpdateCostingPrice(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Selling Price (LKR)</label>
                <input type="number" min="0" step="0.01" value={updateSellingPrice} onChange={(e) => setUpdateSellingPrice(e.target.value)} className={inputClass} />
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
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Final Product Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Packed Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Costing Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Selling Price</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expiry</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Label</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Barcode / QR</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-sm text-gray-500">No packaging batches found.</td></tr>
                ) : (
                  rows.map((row) => {
                    const order = resolveOrder(row);
                    return (
                      <tr key={row.id} className="hover:bg-rose-50/40 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">#{row.id}</td>
                        <td className="px-4 py-2.5 text-xs text-indigo-700 font-semibold">{row.batch_no || order?.batch_no || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-indigo-700">{order?.plan?.order_number || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{order?.product?.code || '-'} - {order?.product?.name || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700 font-semibold">{row.final_product_name || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{row.packaging_material_name} ({Number(row.packaging_material_quantity || 0).toFixed(3)} {row.packaging_material_unit})</td>
                        <td className="px-4 py-2.5 text-sm text-right text-rose-700 font-semibold">{Number(row.packed_quantity || 0).toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-700">LKR {Number(row.unit_price || 0).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-700">LKR {Number(row.selling_price || 0).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-700">{row.expiry_date ? String(row.expiry_date).slice(0, 10) : '-'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 font-semibold">{row.label_code}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">BAR: {row.barcode_value || '-'}<br />QR: {row.qr_value || '-'}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold">
                          <span className={row.status === 'dispatched' ? 'text-indigo-700' : row.status === 'packed' ? 'text-emerald-700' : 'text-slate-700'}>{row.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          <button
                            type="button"
                            onClick={() => removeBatch(row)}
                            disabled={deletingBatchId === row.id}
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            {deletingBatchId === row.id ? 'Removing...' : 'Remove'}
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">{modal.title}</h3>
            <p className="mt-2 text-sm text-gray-700">{modal.message}</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              {modal.variant === 'confirm' && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {modal.cancelLabel || 'Cancel'}
                </button>
              )}
              <button
                type="button"
                onClick={handleModalConfirm}
                className="rounded-md bg-gradient-to-r from-rose-600 to-pink-600 px-4 py-2 text-sm font-medium text-white hover:from-rose-700 hover:to-pink-700"
              >
                {modal.confirmLabel || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-amber-100 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">Transfer QC Balance</h3>
            <p className="mt-1 text-sm text-gray-700">
              Move leftover approved quantity from selected QC batch to another approved QC batch.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source QC Batch</label>
                <input
                  value={selectedQc ? `QC #${selectedQc.id}` : '-'}
                  disabled
                  className={`${inputClass} bg-gray-100 text-gray-600 cursor-not-allowed`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Available Balance</label>
                <input
                  value={selectedQcBalance.toFixed(3)}
                  disabled
                  className={`${inputClass} bg-gray-100 text-gray-600 cursor-not-allowed`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Target QC Batch</label>
                <select
                  value={transferTargetQcId}
                  onChange={(e) => setTransferTargetQcId(Number(e.target.value))}
                  className={inputClass}
                >
                  <option value={0}>Select target QC batch</option>
                  {transferTargetOptions.map((qc) => {
                    const order = resolveOrder(qc);
                    return (
                      <option key={qc.id} value={qc.id}>
                        QC #{qc.id} | {order?.batch_no || '-'} | {order?.product?.code || '-'} - {order?.product?.name || '-'}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Transfer Quantity</label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={transferQuantity}
                  onChange={(e) => setTransferQuantity(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeTransferModal}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransferBalance}
                disabled={transferSaving}
                className="rounded-md bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-sm font-medium text-white hover:from-amber-700 hover:to-orange-700 disabled:opacity-50"
              >
                {transferSaving ? 'Transferring...' : 'Transfer Balance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
