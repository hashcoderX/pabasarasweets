'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

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
type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

const productionPlanningWidgetItems = [
  { id: 'production-planning-nav-bar', name: 'Production Planning Navigation Bar' },
  { id: 'production-planning-flow-card', name: 'Production Planning Flow Card' },
  { id: 'production-planning-summary-cards', name: 'Production Planning Summary Cards' },
  { id: 'production-planning-content-panels', name: 'Production Planning Content Panels' },
  { id: 'production-planning-order-confirm-modal', name: 'Production Planning Order Confirm Modal' },
];

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
  const [applyingFilters, setApplyingFilters] = useState(false);
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

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = productionPlanningWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;
  const inputClass =
    'w-full rounded-xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50/40 px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 focus:outline-none';

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

  const loadPlans = async (
    authToken: string,
    filters?: { from_date?: string; to_date?: string; status?: string }
  ) => {
    const effectiveFromDate = filters?.from_date ?? fromDate;
    const effectiveToDate = filters?.to_date ?? toDate;
    const effectiveStatus = filters?.status ?? statusFilter;

    const res = await axios.get(`${API_URL}/api/production/plans`, {
      headers: authHeaders(authToken),
      params: {
        from_date: effectiveFromDate || undefined,
        to_date: effectiveToDate || undefined,
        status: effectiveStatus || undefined,
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
    const hiddenKeys = productionPlanningWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
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
    const fallbackWidgetKey = productionPlanningWidgetItems[0]?.id || 'production-planning-nav-bar';

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

  const filteredBomsForProduct = useMemo(() => {
    if (!planProductId) return boms;
    return boms.filter((bom) => Number(bom.product_id) === Number(planProductId));
  }, [boms, planProductId]);

  const latestPlanForSelectedProduct = useMemo(() => {
    if (!planProductId) return null;

    const productPlans = plans.filter((plan) => Number(plan.product_id) === Number(planProductId));
    if (productPlans.length === 0) return null;

    return productPlans.reduce((latest, current) => {
      const latestDate = new Date(String(latest.plan_date)).getTime();
      const currentDate = new Date(String(current.plan_date)).getTime();

      if (currentDate > latestDate) return current;
      if (currentDate === latestDate && Number(current.id) > Number(latest.id)) return current;
      return latest;
    });
  }, [plans, planProductId]);

  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const aDate = new Date(String(a.plan_date)).getTime();
      const bDate = new Date(String(b.plan_date)).getTime();

      if (aDate !== bDate) return bDate - aDate;
      return Number(b.id) - Number(a.id);
    });
  }, [plans]);

  const todayPlans = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return sortedPlans.filter((plan) => String(plan.plan_date).slice(0, 10) === today);
  }, [sortedPlans]);

  useEffect(() => {
    if (!latestPlanForSelectedProduct) return;

    const latestTarget = Number(latestPlanForSelectedProduct.target_quantity || 0);
    if (latestTarget > 0) {
      setPlanTargetQuantity(String(latestTarget));
    }
  }, [latestPlanForSelectedProduct]);

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

    if (fromDate && toDate && fromDate > toDate) {
      setErrorMessage('From Date cannot be later than To Date.');
      return;
    }

    try {
      setApplyingFilters(true);
      setMessage('');
      setErrorMessage('');
      await loadPlans(token, {
        from_date: fromDate,
        to_date: toDate,
        status: statusFilter,
      });
      setMessage('Filters applied.');
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || 'Failed to apply filters.');
    } finally {
      setApplyingFilters(false);
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.12),_transparent_28%),linear-gradient(180deg,_#f5fffb_0%,_#ecfeff_46%,_#f0fdf4_100%)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_25%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.12),_transparent_28%),linear-gradient(180deg,_#f5fffb_0%,_#ecfeff_46%,_#f0fdf4_100%)]">
      {isWidgetVisible('production-planning-nav-bar') && <nav className="relative z-10 border-b border-emerald-100/80 bg-white/80 backdrop-blur-lg shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_18px_65px_-35px_rgba(5,150,105,0.45)]">
            <div className="border-b border-emerald-100 bg-gradient-to-r from-slate-900 via-teal-900 to-cyan-900 px-6 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white">Production Planning</h1>
                  <p className="mt-1 text-sm text-cyan-100/90">Schedule production, set targets, and create production orders.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
                  Planning Hub
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 bg-gradient-to-r from-emerald-50/90 via-cyan-50/70 to-teal-50 px-4 py-3">
              <Link
                href="/dashboard/production"
                className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Back to Production
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-full border border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
        {!widgetControlsLocked && <div className="max-w-7xl mx-auto px-4 pb-4 sm:px-6 lg:px-8"><button type="button" onClick={() => stageWidgetVisibilityChange('production-planning-nav-bar', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
      </nav>}

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

        {isWidgetVisible('production-planning-flow-card') && <section className="rounded-2xl border border-teal-200 bg-teal-50/75 px-4 py-3 text-sm text-teal-900 shadow-sm">
          <p className="font-semibold">Recommended flow</p>
          <p className="mt-1">1) Filter and review existing plans, 2) Create a new production plan, 3) Verify today&apos;s queue, 4) Create production order when ready.</p>
          {!widgetControlsLocked && <div className="mt-3"><button type="button" onClick={() => stageWidgetVisibilityChange('production-planning-flow-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </section>}

        {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {errorMessage && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>}

        {isWidgetVisible('production-planning-summary-cards') && <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.15em] text-cyan-600">Total Plans</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{summary.total_plans}</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.15em] text-emerald-600">Today Plans</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{summary.today_plans}</div>
          </div>
          <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.15em] text-teal-600">Total Target Qty</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{Number(summary.total_target_quantity || 0).toFixed(3)}</div>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.15em] text-indigo-600">Scheduled/Order Created</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{summary.scheduled_or_order_created}</div>
          </div>
          {!widgetControlsLocked && <div className="md:col-span-2 xl:col-span-4"><button type="button" onClick={() => stageWidgetVisibilityChange('production-planning-summary-cards', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </section>}

        {isWidgetVisible('production-planning-content-panels') && <><section className="rounded-3xl border border-emerald-100 bg-white shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Production Schedule Filters</h2>
          <p className="text-xs text-gray-500 mb-4">Use date range and status together to quickly find missing or pending plans.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyQuickFilter('all')}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                quickFilter === 'all'
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
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
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
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
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
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
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
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
              disabled={applyingFilters}
              onClick={applyFilters}
              className="h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white text-sm font-medium hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-50"
            >
              {applyingFilters ? 'Applying...' : 'Apply'}
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
              className="h-[42px] px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="rounded-3xl border border-emerald-100 bg-white shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create Daily Production Plan</h2>
            <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-800">
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
                <p className="mt-1 text-[11px] text-gray-500">
                  Batch Count means how many production runs you plan to execute for this plan date and shift.
                </p>
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
              className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white text-sm font-medium hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-50"
            >
              {saving ? 'Saving Plan...' : 'Save Production Plan'}
            </button>
          </section>

          <section className="rounded-3xl border border-emerald-100 bg-white shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Production Plan (Today)</h2>
            <div className="space-y-3 max-h-[420px] overflow-auto">
              {todayPlans.length === 0 ? (
                <div className="text-sm text-gray-500">No plans scheduled for today.</div>
              ) : (
                todayPlans.map((plan) => (
                  <div key={plan.id} className="rounded-xl border border-cyan-100 bg-cyan-50/40 p-3">
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

        <section className="rounded-3xl border border-emerald-100 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-cyan-50 text-sm font-semibold text-gray-800">
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
                {sortedPlans.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No production plans found.</td></tr>
                ) : (
                  sortedPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-emerald-50/40 transition-colors">
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
                          className="px-3 py-1.5 rounded-full text-xs font-medium border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
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
        {!widgetControlsLocked && <div><button type="button" onClick={() => stageWidgetVisibilityChange('production-planning-content-panels', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </>}
      </main>

      {isWidgetVisible('production-planning-order-confirm-modal') && confirmModal.open && confirmModal.plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900">Create Production Order</h3>
            <p className="mt-2 text-sm text-gray-600">
              Create order for {confirmModal.plan.product?.code || '-'} - {confirmModal.plan.product?.name || '-'} on {String(confirmModal.plan.plan_date).slice(0, 10)}?
            </p>
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Target: {Number(confirmModal.plan.target_quantity || 0).toFixed(3)} | Batches: {Number(confirmModal.plan.batch_count || 0).toFixed(2)}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreateOrderConfirm}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCreateOrder}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-3 py-2 text-sm font-medium text-white hover:from-emerald-700 hover:to-cyan-700"
              >
                Confirm Create Order
              </button>
            </div>
          </div>
        </div>
      )}
      {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{productionPlanningWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
    </div>
  );
}
