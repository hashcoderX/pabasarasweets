'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type BatchRow = {
  id: number;
  batch_no?: string | null;
  status: 'completed' | 'cancelled' | 'started';
  production_quantity: number;
  produced_quantity: number;
  wastage_quantity: number;
  started_at?: string | null;
  completed_at?: string | null;
  plan?: { order_number?: string | null; plan_date?: string | null } | null;
  product?: { code: string; name: string; unit: string };
};

type QcInspection = {
  id: number;
  production_order_id: number;
  inspection_date: string;
  inspector_name: string;
  quality_status: 'approved' | 'rejected' | 'hold';
  approved_quantity: number;
  rejected_quantity: number;
  food_safety_checklist?: {
    temperature_check?: boolean;
    hygiene_check?: boolean;
    packaging_check?: boolean;
    label_check?: boolean;
  } | null;
  defects_notes?: string | null;
  rejection_reason?: string | null;
  report_notes?: string | null;
  productionOrder?: BatchRow;
  production_order?: BatchRow;
};

type QcSummary = {
  total_inspections: number;
  approved_batches: number;
  rejected_batches: number;
  hold_batches: number;
  approved_quantity: number;
  rejected_quantity: number;
};

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

const productionQcWidgetItems = [
  { id: 'production-qc-nav-bar', name: 'Production Quality Control Navigation Bar' },
  { id: 'production-qc-summary-cards', name: 'Production Quality Control Summary Cards' },
  { id: 'production-qc-content-panels', name: 'Production Quality Control Content Panels' },
];

export default function QualityControlPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [completedBatches, setCompletedBatches] = useState<BatchRow[]>([]);
  const [qcRows, setQcRows] = useState<QcInspection[]>([]);
  const [statusDrafts, setStatusDrafts] = useState<Record<number, 'approved' | 'rejected' | 'hold'>>({});
  const [updatingStatusId, setUpdatingStatusId] = useState<number>(0);
  const [deletingInspectionId, setDeletingInspectionId] = useState<number>(0);
  const [summary, setSummary] = useState<QcSummary>({
    total_inspections: 0,
    approved_batches: 0,
    rejected_batches: 0,
    hold_batches: 0,
    approved_quantity: 0,
    rejected_quantity: 0,
  });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'approved' | 'rejected' | 'hold' | ''>('');
  const [search, setSearch] = useState('');

  const [selectedBatchId, setSelectedBatchId] = useState<number>(0);
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inspectorName, setInspectorName] = useState('');
  const [qualityStatus, setQualityStatus] = useState<'approved' | 'rejected' | 'hold'>('hold');
  const [approvedQty, setApprovedQty] = useState('0');
  const [rejectedQty, setRejectedQty] = useState('0');
  const [temperatureCheck, setTemperatureCheck] = useState(false);
  const [hygieneCheck, setHygieneCheck] = useState(false);
  const [packagingCheck, setPackagingCheck] = useState(false);
  const [labelCheck, setLabelCheck] = useState(false);
  const [defectsNotes, setDefectsNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [widgetControlsLocked, setWidgetControlsLocked] = useState(false);
  const [showSuperAdminConfirmModal, setShowSuperAdminConfirmModal] = useState(false);
  const [superAdminModalMode, setSuperAdminModalMode] = useState<SuperAdminModalMode>('apply');
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<WidgetVisibilityChange[]>([]);
  const [widgetVisibilitySnapshot, setWidgetVisibilitySnapshot] = useState<Record<string, boolean> | null>(null);
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminConfirmLoading, setSuperAdminConfirmLoading] = useState(false);
  const [restoreWidgetListVisible, setRestoreWidgetListVisible] = useState(false);
  const [restoreWidgetLoadingKey, setRestoreWidgetLoadingKey] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  const router = useRouter();
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = productionQcWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;
  const inputClass =
    'w-full rounded-xl border border-violet-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 focus:outline-none';

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  const fetchWidgetVisibility = useCallback(async (authToken: string) => {
    if (!authToken) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      setWidgetVisibility(response.data?.data?.widgets || {});
      setWidgetControlsLocked(Boolean(response.data?.data?.widget_controls_locked));
    } catch {
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    }
  }, []);

  const formatInspectionDate = (value?: string | null) => {
    if (!value) return '-';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);

    const hasTime = String(value).includes('T') || /\d{2}:\d{2}/.test(String(value));
    if (hasTime) {
      return parsed.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
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

      const [batchesRes, qcRes] = await Promise.all([
        axios.get(`${API_URL}/api/production/execution/batch-history`, {
          headers: authHeaders(authToken),
          params: { status: 'completed', per_page: 200 },
        }),
        axios.get(`${API_URL}/api/production/qc-inspections`, {
          headers: authHeaders(authToken),
          params: {
            from_date: fromDate || undefined,
            to_date: toDate || undefined,
            quality_status: statusFilter || undefined,
            search: search || undefined,
            per_page: 200,
          },
        }),
      ]);

      setCompletedBatches(batchesRes.data?.data?.data || []);
      setQcRows(qcRes.data?.data?.data || []);
      setSummary(qcRes.data?.data?.summary || {
        total_inspections: 0,
        approved_batches: 0,
        rejected_batches: 0,
        hold_batches: 0,
        approved_quantity: 0,
        rejected_quantity: 0,
      });
    } catch (error: any) {
      console.error('Failed to load QC data:', error);
      if (error?.response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
        return;
      }
      setMessage(error?.response?.data?.message || 'Failed to load QC data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadData(token);
    fetchWidgetVisibility(token);
  }, [token, fetchWidgetVisibility]);

  const stageWidgetVisibilityChange = (widgetKey: string, isVisible: boolean) => {
    if (widgetControlsLocked) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: isVisible }));
    setPendingWidgetChanges((prev) => {
      const remaining = prev.filter((entry) => entry.widget_key !== widgetKey);
      return [...remaining, { widget_key: widgetKey, is_visible: isVisible }];
    });
  };

  const rollbackPendingWidgetChanges = () => {
    if (widgetVisibilitySnapshot) setWidgetVisibility(widgetVisibilitySnapshot);
    setPendingWidgetChanges([]);
    setWidgetVisibilitySnapshot(null);
    setShowSuperAdminConfirmModal(false);
    setSuperAdminModalMode('apply');
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
  };

  const openSuperAdminConfirmation = (changes: WidgetVisibilityChange[] = [], mode: SuperAdminModalMode = 'apply') => {
    if (mode !== 'unlock' && !changes.length) return;
    setSuperAdminModalMode(mode);
    setPendingWidgetChanges(changes);
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
    setShowSuperAdminConfirmModal(true);
  };

  const applyWidgetVisibilityChanges = async () => {
    if (superAdminModalMode !== 'apply' || !pendingWidgetChanges.length || !token) return;
    if (!superAdminEmail.trim() || !superAdminPassword) return;

    try {
      setSuperAdminConfirmLoading(true);
      for (const change of pendingWidgetChanges) {
        await axios.put('/api/dashboard/widgets/me', {
          widget_key: change.widget_key,
          is_visible: change.is_visible,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: true,
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
      }
      setWidgetControlsLocked(true);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const showRestoreWidgetList = () => {
    const hiddenKeys = productionQcWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) return;
    openSuperAdminConfirmation(hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })), 'restore');
    setRestoreWidgetListVisible(true);
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;

    try {
      setRestoreWidgetLoadingKey(widgetKey);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: widgetKey,
        is_visible: true,
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: false,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => openSuperAdminConfirmation([], 'unlock');

  const unlockWidgetControls = async () => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    const fallbackWidgetKey = productionQcWidgetItems[0]?.id || 'production-qc-nav-bar';

    try {
      setSuperAdminConfirmLoading(true);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: fallbackWidgetKey,
        is_visible: isWidgetVisible(fallbackWidgetKey),
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: false,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      setWidgetControlsLocked(false);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  useEffect(() => {
    setStatusDrafts((prev) => {
      const next = { ...prev };
      qcRows.forEach((row) => {
        if (!next[row.id]) {
          next[row.id] = row.quality_status;
        }
      });
      return next;
    });
  }, [qcRows]);

  const applyFilters = async () => {
    if (!token) return;
    await loadData(token);
  };

  const saveInspection = async () => {
    if (!token) return;
    if (!selectedBatchId) {
      alert('Please select completed batch for inspection.');
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/api/production/qc-inspections`,
        {
          production_order_id: selectedBatchId,
          inspection_date: inspectionDate,
          inspector_name: inspectorName || 'QC Inspector',
          quality_status: qualityStatus,
          approved_quantity: Number(approvedQty || 0),
          rejected_quantity: Number(rejectedQty || 0),
          food_safety_checklist: {
            temperature_check: temperatureCheck,
            hygiene_check: hygieneCheck,
            packaging_check: packagingCheck,
            label_check: labelCheck,
          },
          defects_notes: defectsNotes || null,
          rejection_reason: rejectionReason || null,
          report_notes: reportNotes || null,
        },
        { headers: authHeaders(token) }
      );

      setSelectedBatchId(0);
      setInspectorName('');
      setQualityStatus('hold');
      setApprovedQty('0');
      setRejectedQty('0');
      setTemperatureCheck(false);
      setHygieneCheck(false);
      setPackagingCheck(false);
      setLabelCheck(false);
      setDefectsNotes('');
      setRejectionReason('');
      setReportNotes('');
      setMessage('QC inspection saved successfully.');
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to save QC inspection.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      alert(firstError?.[0] || apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const updateInspectionStatus = async (row: QcInspection) => {
    if (!token) return;

    const nextStatus = statusDrafts[row.id] || row.quality_status;
    if (nextStatus === row.quality_status) {
      setMessage('No status change to update.');
      return;
    }

    try {
      setUpdatingStatusId(row.id);
      setMessage('');
      await axios.put(
        `${API_URL}/api/production/qc-inspections/${row.id}`,
        { quality_status: nextStatus },
        { headers: authHeaders(token) }
      );

      setMessage(`QC status updated to ${nextStatus}.`);
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to update QC status.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      alert(firstError?.[0] || apiMessage);
    } finally {
      setUpdatingStatusId(0);
    }
  };

  const removeInspection = async (row: QcInspection) => {
    if (!token) return;

    const canDelete = window.confirm(`Remove QC inspection #${row.id}?`);
    if (!canDelete) return;

    try {
      setDeletingInspectionId(row.id);
      await axios.delete(`${API_URL}/api/production/qc-inspections/${row.id}`, {
        headers: authHeaders(token),
      });

      setMessage('QC inspection removed successfully.');
      await loadData(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to remove QC inspection.';
      alert(apiMessage);
    } finally {
      setDeletingInspectionId(0);
    }
  };

  const exportQcCsv = () => {
    if (qcRows.length === 0) {
      alert('No QC rows available for export.');
      return;
    }

    const headers = [
      'Inspection ID',
      'Batch No',
      'Date',
      'Inspector',
      'Order Number',
      'Product Code',
      'Product Name',
      'Status',
      'Approved Qty',
      'Rejected Qty',
      'Temp Check',
      'Hygiene Check',
      'Packaging Check',
      'Label Check',
      'Defects',
      'Rejection Reason',
      'Notes',
    ];

    const rows = qcRows.map((row) => {
      const productionOrder = row.productionOrder || row.production_order;

      return [
        row.id,
        productionOrder?.batch_no || '',
        row.inspection_date,
        row.inspector_name,
        productionOrder?.plan?.order_number || '',
        productionOrder?.product?.code || '',
        productionOrder?.product?.name || '',
        row.quality_status,
        Number(row.approved_quantity || 0).toFixed(3),
        Number(row.rejected_quantity || 0).toFixed(3),
        row.food_safety_checklist?.temperature_check ? 'Yes' : 'No',
        row.food_safety_checklist?.hygiene_check ? 'Yes' : 'No',
        row.food_safety_checklist?.packaging_check ? 'Yes' : 'No',
        row.food_safety_checklist?.label_check ? 'Yes' : 'No',
        row.defects_notes || '',
        row.rejection_reason || '',
        row.report_notes || '',
      ];
    });

    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qc_report_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-pink-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-pink-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-violet-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      {isWidgetVisible('production-qc-nav-bar') && <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">Quality Control</h1>
              <p className="text-xs text-gray-600">Inspection, batch approval/rejection, food safety checklist and QC reports</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/production" className="px-4 py-2 border border-violet-200 bg-violet-50 text-violet-700 rounded-md text-sm font-medium hover:bg-violet-100">Back to Production</Link>
              <button onClick={handleLogout} className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-5 py-2 rounded-full text-sm font-medium">Logout</button>
            </div>
          </div>
        </div>
        {!widgetControlsLocked && <div className="max-w-7xl mx-auto px-4 pb-4 sm:px-6 lg:px-8"><button type="button" onClick={() => stageWidgetVisibilityChange('production-qc-nav-bar', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
      </nav>}

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="sticky top-3 z-40 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Widget Controls</h3>
              <p className="text-xs text-slate-500">Hide widgets, fix controls, restore hidden widgets, and unlock controls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => openSuperAdminConfirmation(pendingWidgetChanges, 'apply')} disabled={widgetControlsLocked || pendingWidgetChanges.length === 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Fix Widgets</button>
              <button type="button" onClick={showRestoreWidgetList} disabled={hiddenWidgetCount === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Restore Widgets ({hiddenWidgetCount})</button>
              <button type="button" onClick={openUnlockWidgetsAfterFix} disabled={!widgetControlsLocked} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-60">Unlock Widgets</button>
            </div>
          </div>
        </section>

        {message && <div className="rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">{message}</div>}

        {isWidgetVisible('production-qc-summary-cards') && <section className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Total Inspections</div><div className="text-2xl font-bold text-gray-900">{summary.total_inspections}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Approved</div><div className="text-2xl font-bold text-emerald-700">{summary.approved_batches}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Rejected</div><div className="text-2xl font-bold text-red-700">{summary.rejected_batches}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">On Hold</div><div className="text-2xl font-bold text-amber-700">{summary.hold_batches}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Approved Qty</div><div className="text-2xl font-bold text-emerald-700">{Number(summary.approved_quantity || 0).toFixed(3)}</div></div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm"><div className="text-xs text-gray-500">Rejected Qty</div><div className="text-2xl font-bold text-red-700">{Number(summary.rejected_quantity || 0).toFixed(3)}</div></div>
          {!widgetControlsLocked && <div className="md:col-span-3 xl:col-span-6"><button type="button" onClick={() => stageWidgetVisibilityChange('production-qc-summary-cards', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </section>}

        {isWidgetVisible('production-qc-content-panels') && <><div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Inspection Entry</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Completed Batch</label>
                <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(Number(e.target.value))} className={inputClass}>
                  <option value={0}>Select completed batch</option>
                  {completedBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      #{batch.id} | {batch.product?.code || '-'} - {batch.product?.name || '-'} | {batch.plan?.order_number || '-'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Inspection Date</label>
                <input type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Inspector Name</label>
                <input value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} className={inputClass} placeholder="Inspector" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Batch Status</label>
                <select value={qualityStatus} onChange={(e) => setQualityStatus(e.target.value as 'approved' | 'rejected' | 'hold')} className={inputClass}>
                  <option value="hold">Hold</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Approved Quantity</label>
                <input type="number" min="0" step="0.001" value={approvedQty} onChange={(e) => setApprovedQty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rejected Quantity</label>
                <input type="number" min="0" step="0.001" value={rejectedQty} onChange={(e) => setRejectedQty(e.target.value)} className={inputClass} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Defects Notes</label>
                <input value={defectsNotes} onChange={(e) => setDefectsNotes(e.target.value)} className={inputClass} placeholder="Any defects observed" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Rejection Reason</label>
                <input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className={inputClass} placeholder="Required if rejected" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">QC Report Notes</label>
                <input value={reportNotes} onChange={(e) => setReportNotes(e.target.value)} className={inputClass} placeholder="Optional report remarks" />
              </div>
            </div>

            <div className="mt-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Food Safety Checklist</div>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
                <label className="flex items-center gap-2"><input type="checkbox" checked={temperatureCheck} onChange={(e) => setTemperatureCheck(e.target.checked)} /> Temperature Check</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={hygieneCheck} onChange={(e) => setHygieneCheck(e.target.checked)} /> Hygiene Check</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={packagingCheck} onChange={(e) => setPackagingCheck(e.target.checked)} /> Packaging Check</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={labelCheck} onChange={(e) => setLabelCheck(e.target.checked)} /> Label Check</label>
              </div>
            </div>

            <button type="button" disabled={saving} onClick={saveInspection} className="mt-4 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-md text-sm font-medium hover:from-violet-700 hover:to-purple-700 disabled:opacity-50">Save QC Inspection</button>
          </section>

          <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">QC Reports Filter</h2>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">QC Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'approved' | 'rejected' | 'hold' | '')} className={inputClass}>
                  <option value="">All</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="hold">Hold</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
                <input value={search} onChange={(e) => setSearch(e.target.value)} className={inputClass} placeholder="Inspector/Product/Order" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={applyFilters} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700">Apply Filters</button>
              <button type="button" onClick={exportQcCsv} className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-md text-sm font-medium hover:bg-slate-50">Download CSV</button>
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-violet-50 to-purple-50 text-sm font-semibold text-gray-800">QC Inspection Records</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch No</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Inspector</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Approved</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rejected</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Update Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Food Safety</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {qcRows.length === 0 ? (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500">No QC records found.</td></tr>
                ) : (
                  qcRows.map((row) => {
                    const productionOrder = row.productionOrder || row.production_order;

                    return (
                      <tr key={row.id} className="hover:bg-violet-50/40 transition-colors">
                        <td className="px-4 py-2.5 text-sm text-gray-700" title={row.inspection_date}>{formatInspectionDate(row.inspection_date)}</td>
                        <td className="px-4 py-2.5 text-xs text-indigo-700 font-semibold">{productionOrder?.batch_no || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-indigo-700">{productionOrder?.plan?.order_number || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{productionOrder?.product?.code || '-'} - {productionOrder?.product?.name || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{row.inspector_name}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-emerald-700 font-medium">{Number(row.approved_quantity || 0).toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-red-700 font-medium">{Number(row.rejected_quantity || 0).toFixed(3)}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold">
                          <span className={row.quality_status === 'approved' ? 'text-emerald-700' : row.quality_status === 'rejected' ? 'text-red-700' : 'text-amber-700'}>{row.quality_status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          <div className="flex items-center gap-2">
                            <select
                              value={statusDrafts[row.id] || row.quality_status}
                              onChange={(e) => setStatusDrafts((prev) => ({ ...prev, [row.id]: e.target.value as 'approved' | 'rejected' | 'hold' }))}
                              className="rounded-md border border-violet-200 bg-white px-2 py-1 text-xs text-gray-800"
                            >
                              <option value="hold">Hold</option>
                              <option value="approved">Approved</option>
                              <option value="rejected">Rejected</option>
                            </select>
                            <button
                              type="button"
                              disabled={updatingStatusId === row.id}
                              onClick={() => updateInspectionStatus(row)}
                              className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                            >
                              {updatingStatusId === row.id ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">
                          T:{row.food_safety_checklist?.temperature_check ? 'Y' : 'N'} |
                          H:{row.food_safety_checklist?.hygiene_check ? 'Y' : 'N'} |
                          P:{row.food_safety_checklist?.packaging_check ? 'Y' : 'N'} |
                          L:{row.food_safety_checklist?.label_check ? 'Y' : 'N'}
                        </td>
                        <td className="px-4 py-2.5 text-sm">
                          <button
                            type="button"
                            disabled={deletingInspectionId === row.id}
                            onClick={() => removeInspection(row)}
                            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            {deletingInspectionId === row.id ? 'Removing...' : 'Remove'}
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
        {!widgetControlsLocked && <div><button type="button" onClick={() => stageWidgetVisibilityChange('production-qc-content-panels', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </>}
      </main>
      {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{productionQcWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
    </div>
  );
}
