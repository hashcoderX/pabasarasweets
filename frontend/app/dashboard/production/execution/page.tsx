'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type StepKey = 'step1' | 'step2' | 'step3' | 'step4';

type QueueRow = {
  id: number;
  plan_date: string;
  shift?: string | null;
  target_quantity: number;
  priority: 'low' | 'medium' | 'high';
  status: 'draft' | 'scheduled' | 'order_created' | 'in_progress' | 'completed' | 'cancelled';
  order_number?: string | null;
  product?: { id: number; code: string; name: string; unit: string };
  bom?: { id: number; version: string; batch_size: number } | null;
};

type BatchRow = {
  id: number;
  batch_no?: string | null;
  production_plan_id?: number | null;
  production_quantity: number;
  produced_quantity: number;
  wastage_quantity: number;
  machine_name?: string | null;
  workstation_name?: string | null;
  worker_name?: string | null;
  status: 'started' | 'completed' | 'cancelled';
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  plan?: { id: number; order_number?: string | null; status: string; plan_date: string; shift?: string | null } | null;
  product?: { id: number; code: string; name: string; unit: string };
  bom?: { id: number; version: string; batch_size: number } | null;
};

export default function ProductionExecutionPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeStep, setActiveStep] = useState<StepKey>('step1');

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [historyRows, setHistoryRows] = useState<BatchRow[]>([]);

  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'completed' | 'cancelled' | ''>('');
  const [historySearch, setHistorySearch] = useState('');

  const [selectedPlanId, setSelectedPlanId] = useState<number>(0);
  const [machineName, setMachineName] = useState('Machine-01');
  const [workstationName, setWorkstationName] = useState('WS-A');
  const [workerName, setWorkerName] = useState('');
  const [startNotes, setStartNotes] = useState('');

  const [updateBatchId, setUpdateBatchId] = useState<number>(0);
  const [updateStatus, setUpdateStatus] = useState<'started' | 'completed' | 'cancelled'>('started');
  const [updateProducedQty, setUpdateProducedQty] = useState('0');
  const [updateWastageQty, setUpdateWastageQty] = useState('0');
  const [updateNotes, setUpdateNotes] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';
  const router = useRouter();
  const inputClass =
    'w-full rounded-xl border border-amber-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 focus:outline-none';

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  const stepTabs: Array<{ key: StepKey; label: string }> = [
    { key: 'step1', label: 'Step 1: Start Batch' },
    { key: 'step2', label: 'Step 2: Update Batch' },
    { key: 'step3', label: 'Step 3: Active Monitor' },
    { key: 'step4', label: 'Step 4: History' },
  ];

  const readableStatus = (status: string) => status.replace('_', ' ');

  const statusBadgeClass = (status: string) => {
    if (status === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'in_progress' || status === 'started') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (status === 'order_created' || status === 'scheduled') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (status === 'cancelled') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
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
      setErrorMessage('');
      const [queueRes, batchesRes, historyRes] = await Promise.all([
        axios.get(`${API_URL}/api/production/execution/queue`, { headers: authHeaders(authToken) }),
        axios.get(`${API_URL}/api/production/execution/active-batches`, { headers: authHeaders(authToken) }),
        axios.get(`${API_URL}/api/production/execution/batch-history`, {
          headers: authHeaders(authToken),
          params: {
            from_date: historyFromDate || undefined,
            to_date: historyToDate || undefined,
            status: historyStatus || undefined,
            search: historySearch || undefined,
            per_page: 200,
          },
        }),
      ]);

      setQueue(queueRes.data?.data || []);
      setBatches(batchesRes.data?.data || []);
      setHistoryRows(historyRes.data?.data?.data || []);
    } catch (error: any) {
      console.error('Failed to load execution data:', error);
      if (error?.response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
        return;
      }
      setErrorMessage(error?.response?.data?.message || 'Failed to load execution data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadData(token);
  }, [token]);

  const applyHistoryFilters = async () => {
    if (!token) return;
    await loadData(token);
    setActiveStep('step4');
  };

  const exportHistoryCsv = () => {
    if (historyRows.length === 0) {
      setErrorMessage('No history rows available to export.');
      setMessage('');
      return;
    }

    const headers = [
      'Batch ID',
      'Batch No',
      'Order Number',
      'Plan Date',
      'Product Code',
      'Product Name',
      'Target Qty',
      'Produced Qty',
      'Wastage Qty',
      'Status',
      'Machine',
      'Workstation',
      'Worker',
      'Started At',
      'Completed At',
      'Cancelled At',
    ];

    const rows = historyRows.map((row) => [
      row.id,
      row.batch_no || '',
      row.plan?.order_number || '',
      row.plan?.plan_date || '',
      row.product?.code || '',
      row.product?.name || '',
      Number(row.production_quantity || 0).toFixed(3),
      Number(row.produced_quantity || 0).toFixed(3),
      Number(row.wastage_quantity || 0).toFixed(3),
      row.status,
      row.machine_name || '',
      row.workstation_name || '',
      row.worker_name || '',
      row.started_at || '',
      row.completed_at || '',
      row.cancelled_at || '',
    ]);

    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `production_batch_history_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const startBatch = async () => {
    if (!token) return;
    setMessage('');
    setErrorMessage('');

    if (!selectedPlanId) {
      setErrorMessage('Select a queued plan first.');
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/api/production/execution/start-batch`,
        {
          production_plan_id: selectedPlanId,
          machine_name: machineName || null,
          workstation_name: workstationName || null,
          worker_name: workerName || null,
          notes: startNotes || null,
        },
        { headers: authHeaders(token) }
      );

      setSelectedPlanId(0);
      setWorkerName('');
      setStartNotes('');
      setMessage('Production batch started successfully. Raw materials consumed from inventory.');
      setErrorMessage('');
      await loadData(token);
      setActiveStep('step2');
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to start production batch.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      setErrorMessage(firstError?.[0] || apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const updateBatch = async () => {
    if (!token) return;
    setMessage('');
    setErrorMessage('');

    if (!updateBatchId) {
      setErrorMessage('Select active batch first.');
      return;
    }

    try {
      setSaving(true);
      await axios.put(
        `${API_URL}/api/production/execution/batches/${updateBatchId}`,
        {
          status: updateStatus,
          produced_quantity: Number(updateProducedQty || 0),
          wastage_quantity: Number(updateWastageQty || 0),
          notes: updateNotes || null,
        },
        { headers: authHeaders(token) }
      );

      setUpdateNotes('');
      setMessage('Production batch updated successfully.');
      setErrorMessage('');
      await loadData(token);

      if (updateStatus === 'completed' || updateStatus === 'cancelled') {
        setActiveStep('step4');
      } else {
        setActiveStep('step3');
      }
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to update batch.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      setErrorMessage(firstError?.[0] || apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-amber-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">Production Execution</h1>
              <p className="text-xs text-gray-600">Start batches, assign machine/workstation/worker, track status and wastage</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/production" className="px-4 py-2 border border-amber-200 bg-amber-50 text-amber-700 rounded-md text-sm font-medium hover:bg-amber-100">Back to Production</Link>
              <button onClick={handleLogout} className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-5 py-2 rounded-full text-sm font-medium">Logout</button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 shadow-sm">
          <p className="font-semibold">Execution flow</p>
          <p className="mt-1">1) Pick queued plan and start batch, 2) Update produced and wastage, 3) Monitor active batches, 4) Filter and export history.</p>
        </section>

        <section className="rounded-xl border border-white/70 bg-white/90 px-3 py-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {stepTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveStep(tab.key)}
                className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition ${
                  activeStep === tab.key
                    ? 'bg-amber-600 text-white shadow'
                    : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {message && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>}
        {errorMessage && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Queued Plans</div>
            <div className="text-2xl font-bold text-gray-900">{queue.length}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Active Batches</div>
            <div className="text-2xl font-bold text-gray-900">{batches.length}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Today</div>
            <div className="text-2xl font-bold text-gray-900">{new Date().toLocaleDateString()}</div>
          </div>
        </section>

        <div className={`grid grid-cols-1 xl:grid-cols-2 gap-6 ${activeStep === 'step1' || activeStep === 'step2' ? '' : 'hidden'}`}>
          <section className={`rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5 ${activeStep === 'step1' ? '' : 'hidden'}`}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Start Production Batch</h2>
            <p className="text-xs text-gray-500 mb-4">Starting a batch will consume planned raw materials from inventory based on BOM.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Queued Production Plan</label>
                <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(Number(e.target.value))} className={inputClass}>
                  <option value={0}>Select plan from queue</option>
                  {queue.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      #{plan.id} | {plan.product?.code || '-'} - {plan.product?.name || '-'} | {String(plan.plan_date).slice(0, 10)} | Qty {Number(plan.target_quantity || 0).toFixed(3)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Machine</label>
                <input value={machineName} onChange={(e) => setMachineName(e.target.value)} className={inputClass} placeholder="Machine-01" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Workstation</label>
                <input value={workstationName} onChange={(e) => setWorkstationName(e.target.value)} className={inputClass} placeholder="WS-A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Worker</label>
                <input value={workerName} onChange={(e) => setWorkerName(e.target.value)} className={inputClass} placeholder="Operator name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Notes</label>
                <input value={startNotes} onChange={(e) => setStartNotes(e.target.value)} className={inputClass} placeholder="Optional" />
              </div>
            </div>
            <button type="button" disabled={saving} onClick={startBatch} className="mt-4 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-md text-sm font-medium hover:from-amber-700 hover:to-orange-700 disabled:opacity-50">
              Start Batch + Consume Materials
            </button>
          </section>

          <section className={`rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5 ${activeStep === 'step2' ? '' : 'hidden'}`}>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Update Active Batch Status</h2>
            <p className="text-xs text-gray-500 mb-4">Use this after production progress to update final output and wastage accurately.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Active Batch</label>
                <select
                  value={updateBatchId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setUpdateBatchId(id);
                    const found = batches.find((batch) => batch.id === id);
                    if (found) {
                      setUpdateStatus(found.status);
                      setUpdateProducedQty(String(found.produced_quantity ?? 0));
                      setUpdateWastageQty(String(found.wastage_quantity ?? 0));
                    }
                  }}
                  className={inputClass}
                >
                  <option value={0}>Select active batch</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      Batch #{batch.id} | {batch.product?.code || '-'} - {batch.product?.name || '-'} | Target {Number(batch.production_quantity || 0).toFixed(3)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={updateStatus} onChange={(e) => setUpdateStatus(e.target.value as 'started' | 'completed' | 'cancelled')} className={inputClass}>
                  <option value="started">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Produced Quantity</label>
                <input type="number" min="0" step="0.001" value={updateProducedQty} onChange={(e) => setUpdateProducedQty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Wastage Quantity</label>
                <input type="number" min="0" step="0.001" value={updateWastageQty} onChange={(e) => setUpdateWastageQty(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Update Notes</label>
                <input value={updateNotes} onChange={(e) => setUpdateNotes(e.target.value)} className={inputClass} placeholder="Optional" />
              </div>
            </div>
            <button type="button" disabled={saving} onClick={updateBatch} className="mt-4 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50">
              Save Batch Update
            </button>
          </section>
        </div>

        <section className={`rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden ${activeStep === 'step3' ? '' : 'hidden'}`}>
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-amber-50 to-orange-50 text-sm font-semibold text-gray-800">Active Production Batches</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch No</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Produced</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Wastage</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Assignments</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {batches.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">No active batches found.</td></tr>
                ) : (
                  batches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">#{batch.id}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{batch.product?.code || '-'} - {batch.product?.name || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-indigo-700 font-semibold">{batch.batch_no || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(batch.production_quantity || 0).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-emerald-700 font-medium">{Number(batch.produced_quantity || 0).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-red-700 font-medium">{Number(batch.wastage_quantity || 0).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        Machine: {batch.machine_name || '-'}<br />
                        Workstation: {batch.workstation_name || '-'}<br />
                        Worker: {batch.worker_name || '-'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(batch.status)}`}>
                          {readableStatus(batch.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden ${activeStep === 'step4' ? '' : 'hidden'}`}>
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-slate-50 to-gray-100 text-sm font-semibold text-gray-800">Completed/Cancelled Batch History</div>

          <div className="p-4 border-b border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                <input type="date" value={historyFromDate} onChange={(e) => setHistoryFromDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                <input type="date" value={historyToDate} onChange={(e) => setHistoryToDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value as 'completed' | 'cancelled' | '')} className={inputClass}>
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Search (Product/Order)</label>
                <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className={inputClass} placeholder="e.g. PO-20260317 or product code" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={applyHistoryFilters} className="h-[42px] px-3 py-2 bg-gradient-to-r from-slate-600 to-gray-700 text-white rounded-md text-sm font-medium hover:from-slate-700 hover:to-gray-800">Apply</button>
                <button type="button" onClick={exportHistoryCsv} className="h-[42px] px-3 py-2 border border-slate-200 bg-slate-50 text-slate-700 rounded-md text-sm font-medium hover:bg-slate-100">CSV</button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Batch No</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Produced</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Wastage</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {historyRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No history rows found for selected filters.</td></tr>
                ) : (
                  historyRows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">#{row.id}</td>
                      <td className="px-4 py-2.5 text-sm text-indigo-700">{row.plan?.order_number || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{row.product?.code || '-'} - {row.product?.name || '-'}</td>
                      <td className="px-4 py-2.5 text-xs text-indigo-700 font-semibold">{row.batch_no || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(row.production_quantity || 0).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-emerald-700 font-medium">{Number(row.produced_quantity || 0).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-red-700 font-medium">{Number(row.wastage_quantity || 0).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold">
                        <span className={row.status === 'completed' ? 'text-emerald-700' : 'text-red-700'}>{row.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">{row.started_at ? new Date(row.started_at).toLocaleString() : '-'}</td>
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
