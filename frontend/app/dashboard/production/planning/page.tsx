'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';

type Product = {
  id: number;
  name: string;
  code: string;
  unit: string;
};

type Bom = {
  id: number;
  product_id: number;
  version: string;
  batch_size: number;
  product?: Product;
};

type ProductionPlan = {
  id: number;
  product_id: number;
  bom_id?: number | null;
  plan_date: string;
  shift?: string | null;
  target_quantity: number;
  batch_count: number;
  priority: 'low' | 'medium' | 'high';
  status: 'draft' | 'scheduled' | 'order_created' | 'in_progress' | 'completed' | 'cancelled';
  order_number?: string | null;
  notes?: string | null;
  product?: Product;
  bom?: Bom | null;
};

type PlanSummary = {
  total_plans: number;
  today_plans: number;
  total_target_quantity: number;
  scheduled_or_order_created: number;
};

type QuickFilterKey = 'all' | 'today' | 'this_week' | 'pending_orders';

const toDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekRange = (): { start: string; end: string } => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay();
  const diffFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffFromMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: toDateInput(monday),
    end: toDateInput(sunday),
  };
};

const parseList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
};

export default function ProductionPlanningPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingOrderPlanId, setCreatingOrderPlanId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [summary, setSummary] = useState<PlanSummary>({
    total_plans: 0,
    today_plans: 0,
    total_target_quantity: 0,
    scheduled_or_order_created: 0,
  });

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>('all');

  const [confirmModal, setConfirmModal] = useState<{ open: boolean; plan: ProductionPlan | null }>({
    open: false,
    plan: null,
  });

  const [planProductId, setPlanProductId] = useState<number>(0);
  const [planBomId, setPlanBomId] = useState<number>(0);
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [planShift, setPlanShift] = useState('Morning');
  const [planTargetQuantity, setPlanTargetQuantity] = useState('100');
  const [planBatchCount, setPlanBatchCount] = useState('1');
  const [planPriority, setPlanPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [planNotes, setPlanNotes] = useState('');

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020';
  const inputClass =
    'w-full rounded-xl border border-cyan-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 focus:outline-none';

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken || storedToken === 'undefined' || storedToken === 'null') {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  const loadMasterData = async (authToken: string) => {
    const [productsRes, bomsRes] = await Promise.all([
      axios.get(`${API_URL}/api/production/products`, { headers: authHeaders(authToken) }),
      axios.get(`${API_URL}/api/production/boms`, { headers: authHeaders(authToken) }),
    ]);

    setProducts(parseList(productsRes.data));
    setBoms(parseList(bomsRes.data));
  };

  const loadPlans = async (authToken: string) => {
    const res = await axios.get(`${API_URL}/api/production/plans`, {
      headers: authHeaders(authToken),
      params: {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        status: statusFilter || undefined,
        per_page: 200,
      },
    });

    setPlans(res.data?.data?.data || []);
    setSummary(res.data?.data?.summary || {
      total_plans: 0,
      today_plans: 0,
      total_target_quantity: 0,
      scheduled_or_order_created: 0,
    });
  };

  const loadAll = async (authToken: string) => {
    try {
      setLoading(true);
      setMessage('');
      setErrorMessage('');
      await Promise.all([loadMasterData(authToken), loadPlans(authToken)]);
    } catch (error: any) {
      console.error('Failed to load production planning data:', error);
      if (error?.response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
        return;
      }
      setErrorMessage(error?.response?.data?.message || 'Failed to load planning data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadAll(token);
  }, [token]);

  const filteredBomsForProduct = useMemo(() => {
    if (!planProductId) return boms;
    return boms.filter((bom) => Number(bom.product_id) === Number(planProductId));
  }, [boms, planProductId]);

  const todayPlans = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return plans.filter((plan) => String(plan.plan_date).slice(0, 10) === today);
  }, [plans]);

  const createPlan = async () => {
    if (!token) return;
    setMessage('');
    setErrorMessage('');

    if (!planProductId) {
      setErrorMessage('Please select a finished product before saving the plan.');
      return;
    }

    if (!planDate) {
      setErrorMessage('Please select the production date.');
      return;
    }

    if (Number(planTargetQuantity || 0) <= 0) {
      setErrorMessage('Target quantity must be greater than 0.');
      return;
    }

    if (Number(planBatchCount || 0) <= 0) {
      setErrorMessage('Batch count must be greater than 0.');
      return;
    }

    try {
      setSaving(true);
      await axios.post(
        `${API_URL}/api/production/plans`,
        {
          product_id: planProductId,
          bom_id: planBomId || null,
          plan_date: planDate,
          shift: planShift || null,
          target_quantity: Number(planTargetQuantity || 0),
          batch_count: Number(planBatchCount || 0),
          priority: planPriority,
          status: 'scheduled',
          notes: planNotes || null,
        },
        { headers: authHeaders(token) }
      );

      setPlanProductId(0);
      setPlanBomId(0);
      setPlanDate(new Date().toISOString().slice(0, 10));
      setPlanShift('Morning');
      setPlanTargetQuantity('100');
      setPlanBatchCount('1');
      setPlanPriority('medium');
      setPlanNotes('');
      setMessage('Production plan created successfully.');
      setErrorMessage('');
      await loadAll(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to create production plan.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      setErrorMessage(firstError?.[0] || apiMessage);
    } finally {
      setSaving(false);
    }
  };

  const createOrder = async (planId: number) => {
    if (!token) return;
    try {
      setCreatingOrderPlanId(planId);
      setMessage('');
      setErrorMessage('');
      await axios.post(`${API_URL}/api/production/plans/${planId}/create-order`, {}, { headers: authHeaders(token) });
      setMessage('Production order created from selected plan.');
      await loadPlans(token);
    } catch (error: any) {
      const apiMessage = error?.response?.data?.message || 'Failed to create production order.';
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      setErrorMessage(firstError?.[0] || apiMessage);
    } finally {
      setCreatingOrderPlanId(null);
    }
  };

  const openCreateOrderConfirm = (plan: ProductionPlan) => {
    setConfirmModal({ open: true, plan });
  };

  const closeCreateOrderConfirm = () => {
    setConfirmModal({ open: false, plan: null });
  };

  const confirmCreateOrder = async () => {
    if (!confirmModal.plan) return;
    const planId = confirmModal.plan.id;
    closeCreateOrderConfirm();
    await createOrder(planId);
  };

  const applyQuickFilter = async (key: QuickFilterKey) => {
    const today = toDateInput(new Date());
    const weekRange = getWeekRange();

    setQuickFilter(key);
    if (key === 'all') {
      setFromDate('');
      setToDate('');
      setStatusFilter('');
    } else if (key === 'today') {
      setFromDate(today);
      setToDate(today);
      setStatusFilter('');
    } else if (key === 'this_week') {
      setFromDate(weekRange.start);
      setToDate(weekRange.end);
      setStatusFilter('');
    } else if (key === 'pending_orders') {
      setFromDate('');
      setToDate('');
      setStatusFilter('scheduled');
    }

    if (!token) return;

    try {
      setMessage('');
      setErrorMessage('');
      await axios.get(`${API_URL}/api/production/plans`, {
        headers: authHeaders(token),
        params: {
          from_date: key === 'today' ? today : key === 'this_week' ? weekRange.start : undefined,
          to_date: key === 'today' ? today : key === 'this_week' ? weekRange.end : undefined,
          status: key === 'pending_orders' ? 'scheduled' : undefined,
          per_page: 200,
        },
      }).then((res) => {
        setPlans(res.data?.data?.data || []);
        setSummary(res.data?.data?.summary || {
          total_plans: 0,
          today_plans: 0,
          total_target_quantity: 0,
          scheduled_or_order_created: 0,
        });
      });
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to apply quick filter.');
    }
  };

  const applyFilters = async () => {
    if (!token) return;
    try {
      setMessage('');
      setErrorMessage('');
      await loadPlans(token);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to apply filters.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  const statusBadgeClass = (status: ProductionPlan['status']) => {
    if (status === 'order_created') return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (status === 'scheduled') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (status === 'in_progress') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (status === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'cancelled') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const priorityBadgeClass = (priority: ProductionPlan['priority']) => {
    if (priority === 'high') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (priority === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  };

  const readableStatus = (status: ProductionPlan['status']) => status.replace('_', ' ');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-cyan-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">Production Planning</h1>
              <p className="text-xs text-gray-600">Schedule production, set targets, and create production orders</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/production"
                className="px-4 py-2 border border-cyan-200 bg-cyan-50 text-cyan-700 rounded-md text-sm font-medium hover:bg-cyan-100"
              >
                Back to Production
              </Link>
              <button
                onClick={handleLogout}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white px-5 py-2 rounded-full text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-800 shadow-sm">
          <p className="font-semibold">Recommended flow</p>
          <p className="mt-1">1) Filter and review existing plans, 2) Create a new production plan, 3) Verify today&apos;s queue, 4) Create production order when ready.</p>
        </section>

        {message && <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-700">{message}</div>}
        {errorMessage && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>}

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Total Plans</div>
            <div className="text-2xl font-bold text-gray-900">{summary.total_plans}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Today Plans</div>
            <div className="text-2xl font-bold text-gray-900">{summary.today_plans}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Total Target Qty</div>
            <div className="text-2xl font-bold text-gray-900">{Number(summary.total_target_quantity || 0).toFixed(3)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Scheduled/Order Created</div>
            <div className="text-2xl font-bold text-gray-900">{summary.scheduled_or_order_created}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Production Schedule Filters</h2>
          <p className="text-xs text-gray-500 mb-4">Use date range and status together to quickly find missing or pending plans.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyQuickFilter('all')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === 'all'
                  ? 'border-cyan-300 bg-cyan-100 text-cyan-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              All Plans
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter('today')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === 'today'
                  ? 'border-cyan-300 bg-cyan-100 text-cyan-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter('this_week')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === 'this_week'
                  ? 'border-cyan-300 bg-cyan-100 text-cyan-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter('pending_orders')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === 'pending_orders'
                  ? 'border-cyan-300 bg-cyan-100 text-cyan-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Pending Orders
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
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
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="order_created">Order Created</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <button
              type="button"
              onClick={applyFilters}
              className="h-[42px] px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={async () => {
                setQuickFilter('all');
                setFromDate('');
                setToDate('');
                setStatusFilter('');
                if (!token) return;
                try {
                  setMessage('');
                  setErrorMessage('');
                  await loadPlans(token);
                } catch (error: any) {
                  setErrorMessage(error?.response?.data?.message || 'Failed to clear filters.');
                }
              }}
              className="h-[42px] px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Daily Production Plan</h2>
            <div className="mb-4 rounded-md border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-xs text-cyan-800">
              Select product first, then optionally pick BOM version. Keep target and batches greater than zero.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Finished Product</label>
                <select value={planProductId} onChange={(e) => { setPlanProductId(Number(e.target.value)); setPlanBomId(0); }} className={inputClass}>
                  <option value={0}>Select product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>{product.code} - {product.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">BOM Version</label>
                <select value={planBomId} onChange={(e) => setPlanBomId(Number(e.target.value))} className={inputClass}>
                  <option value={0}>Auto / Not selected</option>
                  {filteredBomsForProduct.map((bom) => (
                    <option key={bom.id} value={bom.id}>#{bom.id} - {bom.version} (Batch {Number(bom.batch_size).toFixed(3)})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plan Date</label>
                <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Shift</label>
                <select value={planShift} onChange={(e) => setPlanShift(e.target.value)} className={inputClass}>
                  <option value="Morning">Morning</option>
                  <option value="Evening">Evening</option>
                  <option value="Night">Night</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Production Target Quantity</label>
                <input type="number" min="0" step="0.001" value={planTargetQuantity} onChange={(e) => setPlanTargetQuantity(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Batch Count</label>
                <input type="number" min="0" step="0.01" value={planBatchCount} onChange={(e) => setPlanBatchCount(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                <select value={planPriority} onChange={(e) => setPlanPriority(e.target.value as 'low' | 'medium' | 'high')} className={inputClass}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Planning Notes</label>
                <input value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} className={inputClass} placeholder="Optional notes for this production plan" />
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={createPlan}
              className="mt-4 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-md text-sm font-medium hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving Plan...' : 'Save Production Plan'}
            </button>
          </section>

          <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Production Plan (Today)</h2>
            <div className="space-y-3 max-h-[420px] overflow-auto">
              {todayPlans.length === 0 ? (
                <div className="text-sm text-gray-500">No plans scheduled for today.</div>
              ) : (
                todayPlans.map((plan) => (
                  <div key={plan.id} className="rounded-lg border border-cyan-100 bg-cyan-50/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-800">{plan.product?.code || '-'} - {plan.product?.name || '-'}</div>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(plan.status)}`}>
                        {readableStatus(plan.status)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Date: {String(plan.plan_date).slice(0, 10)} | Shift: {plan.shift || '-'}</div>
                    <div className="text-xs text-gray-600">Target: {Number(plan.target_quantity || 0).toFixed(3)} | Batches: {Number(plan.batch_count || 0).toFixed(2)}</div>
                    <div className="mt-1">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityBadgeClass(plan.priority)}`}>
                        {plan.priority} priority
                      </span>
                    </div>
                    {plan.order_number && <div className="text-xs text-indigo-700 font-medium mt-1">Order: {plan.order_number}</div>}
                    {plan.notes && <div className="text-xs text-gray-500 mt-1">Note: {plan.notes}</div>}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-cyan-50 to-blue-50 text-sm font-semibold text-gray-800">
            Production Plans & Order Creation
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Batches</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Shift</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {plans.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No production plans found.</td></tr>
                ) : (
                  plans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-cyan-50/40 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-gray-700">{String(plan.plan_date).slice(0, 10)}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">{plan.product?.code || '-'} - {plan.product?.name || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(plan.target_quantity || 0).toFixed(3)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(plan.batch_count || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{plan.shift || '-'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${priorityBadgeClass(plan.priority)}`}>
                          {plan.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(plan.status)}`}>
                          {readableStatus(plan.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-indigo-700 font-medium">{plan.order_number || '-'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openCreateOrderConfirm(plan)}
                          disabled={Boolean(plan.order_number) || creatingOrderPlanId === plan.id}
                          className="px-3 py-1.5 rounded-md text-xs font-medium border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {plan.order_number ? 'Order Created' : creatingOrderPlanId === plan.id ? 'Creating...' : 'Create Order'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {confirmModal.open && confirmModal.plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Create Production Order</h3>
            <p className="mt-2 text-sm text-gray-600">
              Create order for {confirmModal.plan.product?.code || '-'} - {confirmModal.plan.product?.name || '-'} on {String(confirmModal.plan.plan_date).slice(0, 10)}?
            </p>
            <div className="mt-3 rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
              Target: {Number(confirmModal.plan.target_quantity || 0).toFixed(3)} | Batches: {Number(confirmModal.plan.batch_count || 0).toFixed(2)}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateOrderConfirm}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCreateOrder}
                className="rounded-md bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-2 text-sm font-medium text-white hover:from-indigo-700 hover:to-blue-700"
              >
                Confirm Create Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
