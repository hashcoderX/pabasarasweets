'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type Product = {
  id: number;
  code?: string;
  name?: string;
  unit?: string;
};

type ProductionPlan = {
  id: number;
  product_id: number;
  plan_date: string;
  shift?: string | null;
  target_quantity: number;
  batch_count: number;
  priority: 'low' | 'medium' | 'high';
  status: 'draft' | 'scheduled' | 'order_created' | 'in_progress' | 'completed' | 'cancelled';
  order_number?: string | null;
  notes?: string | null;
  product?: Product;
};

type BatchRow = {
  id: number;
  production_plan_id?: number | null;
  produced_quantity: number;
  status: 'started' | 'completed' | 'cancelled';
  plan?: {
    id: number;
    order_number?: string | null;
    plan_date?: string;
    status?: string;
  } | null;
};

type NormalizedPlanStatus = 'draft' | 'planned' | 'in_progress' | 'completed' | 'cancelled';

type PlanWithActual = ProductionPlan & {
  normalized_status: NormalizedPlanStatus;
  actual_quantity: number;
  variance: number;
  achievement_pct: number;
};

const toDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
};

const moneyLike = (value: number) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const normalizePlanStatus = (status?: string): NormalizedPlanStatus => {
  if (status === 'scheduled' || status === 'order_created') return 'planned';
  if (status === 'in_progress') return 'in_progress';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'draft';
};

const startOfWeek = (baseDate: Date) => {
  const date = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const day = date.getDay();
  const diffFromMonday = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diffFromMonday);
  return date;
};

const endOfWeek = (baseDate: Date) => {
  const start = startOfWeek(baseDate);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
};

const startOfMonth = (baseDate: Date) => new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
const endOfMonth = (baseDate: Date) => new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

const isDateInRange = (rawDate: string | undefined, from: Date, to: Date) => {
  if (!rawDate) return false;
  const candidate = new Date(`${String(rawDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(candidate.getTime())) return false;
  return candidate >= from && candidate <= to;
};

export default function ProductionPlanningReportsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [activeBatches, setActiveBatches] = useState<BatchRow[]>([]);
  const [historyBatches, setHistoryBatches] = useState<BatchRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | NormalizedPlanStatus>('all');

  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

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

    const verifyAccess = async () => {
      try {
        const userRes = await axios.get('/api/user', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const userData = userRes.data || {};
        const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
        const roleNames = [
          String(userData?.role || ''),
          ...(Array.isArray(userData?.roles)
            ? userData.roles.map((role: any) => String(role?.name || role || ''))
            : []),
        ]
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? userData.roles.flatMap((role: any) =>
              Array.isArray(role?.permissions)
                ? role.permissions.map((permission: any) => String(permission?.name || '').trim().toLowerCase())
                : []
            )
          : [];

        const roleBlob = roleNames.join(' ');
        const isAdminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');

        const hasReportPermission = permissionNames.some((permission: string) => permission.includes('report'));

        if (!isAdminUser && !hasReportPermission) {
          router.push('/dashboard');
          return;
        }

        await fetchData(token);
      } catch (error) {
        console.error('Error checking production planning report access:', error);
        router.push('/dashboard');
      } finally {
        setAccessReady(true);
      }
    };

    verifyAccess();
  }, [token, router]);

  const fetchData = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;

    try {
      setLoading(true);
      setErrorMessage('');

      const [plansRes, activeRes, historyRes] = await Promise.all([
        axios.get(`${API_URL}/api/production/plans`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          params: { per_page: 500 },
        }),
        axios.get(`${API_URL}/api/production/execution/active-batches`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        }),
        axios.get(`${API_URL}/api/production/execution/batch-history`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          params: { per_page: 500 },
        }),
      ]);

      const planRows = parseList(plansRes.data?.data || plansRes.data);
      const activeRows = parseList(activeRes.data?.data || activeRes.data);
      const historyRows = parseList(historyRes.data?.data || historyRes.data);

      setPlans(Array.isArray(planRows) ? (planRows as ProductionPlan[]) : []);
      setActiveBatches(Array.isArray(activeRows) ? (activeRows as BatchRow[]) : []);
      setHistoryBatches(Array.isArray(historyRows) ? (historyRows as BatchRow[]) : []);
    } catch (error) {
      console.error('Error loading production planning report:', error);
      setPlans([]);
      setActiveBatches([]);
      setHistoryBatches([]);
      setErrorMessage('Failed to load production planning report data.');
    } finally {
      setLoading(false);
    }
  };

  const planActualByPlanId = useMemo(() => {
    const map = new Map<number, number>();
    const allBatches = [...activeBatches, ...historyBatches];

    allBatches.forEach((batch) => {
      const planId = Number(batch.production_plan_id || batch.plan?.id || 0);
      if (!planId) return;
      const prev = Number(map.get(planId) || 0);
      map.set(planId, prev + Number(batch.produced_quantity || 0));
    });

    return map;
  }, [activeBatches, historyBatches]);

  const normalizedPlans = useMemo<PlanWithActual[]>(() => {
    return plans.map((plan) => {
      const target = Number(plan.target_quantity || 0);
      const actual = Number(planActualByPlanId.get(plan.id) || 0);
      const variance = target - actual;
      const achievementPct = target > 0 ? (actual / target) * 100 : 0;

      return {
        ...plan,
        normalized_status: normalizePlanStatus(plan.status),
        actual_quantity: actual,
        variance,
        achievement_pct: achievementPct,
      };
    });
  }, [plans, planActualByPlanId]);

  const filteredPlans = useMemo(() => {
    return normalizedPlans
      .filter((plan) => {
        if (statusFilter !== 'all' && plan.normalized_status !== statusFilter) return false;

        if (fromDate || toDate) {
          const candidate = new Date(`${String(plan.plan_date).slice(0, 10)}T00:00:00`);
          if (Number.isNaN(candidate.getTime())) return false;
          if (fromDate && candidate < new Date(`${fromDate}T00:00:00`)) return false;
          if (toDate && candidate > new Date(`${toDate}T23:59:59`)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = new Date(String(a.plan_date)).getTime();
        const dateB = new Date(String(b.plan_date)).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return Number(a.id) - Number(b.id);
      });
  }, [normalizedPlans, statusFilter, fromDate, toDate]);

  const totalPlanned = useMemo(
    () => filteredPlans.reduce((sum, plan) => sum + Number(plan.target_quantity || 0), 0),
    [filteredPlans]
  );

  const totalActual = useMemo(
    () => filteredPlans.reduce((sum, plan) => sum + Number(plan.actual_quantity || 0), 0),
    [filteredPlans]
  );

  const totalVariance = totalPlanned - totalActual;
  const achievementPct = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const buildPeriodMetrics = (periodPlans: PlanWithActual[]) => {
    const planned = periodPlans.reduce((sum, plan) => sum + Number(plan.target_quantity || 0), 0);
    const actual = periodPlans.reduce((sum, plan) => sum + Number(plan.actual_quantity || 0), 0);
    const variance = planned - actual;
    const achievement = planned > 0 ? (actual / planned) * 100 : 0;
    return { planned, actual, variance, achievement, count: periodPlans.length };
  };

  const dailyMetrics = useMemo(() => {
    const periodPlans = filteredPlans.filter((plan) => isDateInRange(plan.plan_date, todayStart, todayEnd));
    return buildPeriodMetrics(periodPlans);
  }, [filteredPlans]);

  const weeklyMetrics = useMemo(() => {
    const periodPlans = filteredPlans.filter((plan) => isDateInRange(plan.plan_date, weekStart, weekEnd));
    return buildPeriodMetrics(periodPlans);
  }, [filteredPlans]);

  const monthlyMetrics = useMemo(() => {
    const periodPlans = filteredPlans.filter((plan) => isDateInRange(plan.plan_date, monthStart, monthEnd));
    return buildPeriodMetrics(periodPlans);
  }, [filteredPlans]);

  const pendingProductionOrders = useMemo(() => {
    return filteredPlans.filter((plan) =>
      ['draft', 'planned', 'in_progress'].includes(plan.normalized_status)
    );
  }, [filteredPlans]);

  const overdueProductionOrders = useMemo(() => {
    const today = new Date(toDateInput(new Date()) + 'T00:00:00');
    return filteredPlans.filter((plan) => {
      const planDate = new Date(`${String(plan.plan_date).slice(0, 10)}T00:00:00`);
      if (Number.isNaN(planDate.getTime())) return false;
      return planDate < today && !['completed', 'cancelled'].includes(plan.normalized_status);
    });
  }, [filteredPlans]);

  const statusSummary = useMemo(() => {
    const base = {
      draft: 0,
      planned: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };

    filteredPlans.forEach((plan) => {
      base[plan.normalized_status] += 1;
    });

    return base;
  }, [filteredPlans]);

  const statusBadgeClass = (status: NormalizedPlanStatus) => {
    if (status === 'planned') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (status === 'in_progress') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (status === 'completed') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (status === 'cancelled') return 'bg-rose-100 text-rose-700 border-rose-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const statusLabel = (status: NormalizedPlanStatus) => {
    if (status === 'in_progress') return 'In Progress';
    if (status === 'planned') return 'Planned';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  if (!token || !accessReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-teal-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-teal-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 h-72 w-72 rounded-full bg-emerald-200 blur-xl"></div>
        <div className="absolute top-40 right-20 h-72 w-72 rounded-full bg-cyan-200 blur-xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <Link href="/dashboard/reports" className="flex items-center space-x-2 text-gray-700 hover:text-emerald-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-medium">Back to Reports</span>
            </Link>
            <button
              type="button"
              onClick={() => fetchData()}
              disabled={loading}
              className="rounded-full bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-60"
            >
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Production Planning Reports</h1>
          <p className="mt-2 text-gray-600">Management-level planning, execution, pending and overdue production visibility.</p>
        </div>

        {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

        <section className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Plan Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | NormalizedPlanStatus)} className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-black">
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="planned">Planned</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="md:col-span-2 flex items-end">
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setStatusFilter('all');
                }}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Planned Quantity</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{moneyLike(totalPlanned)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Actual Quantity</p>
            <p className="mt-2 text-2xl font-bold text-cyan-900">{moneyLike(totalActual)}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Variance</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{moneyLike(totalVariance)}</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Achievement %</p>
            <p className="mt-2 text-2xl font-bold text-indigo-900">{achievementPct.toFixed(2)}%</p>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Daily Production Plan</h2>
            <p className="mt-1 text-xs text-slate-500">{toDateInput(now)}</p>
            <p className="mt-3 text-sm text-slate-700">Planned: <span className="font-semibold">{moneyLike(dailyMetrics.planned)}</span></p>
            <p className="text-sm text-slate-700">Actual: <span className="font-semibold">{moneyLike(dailyMetrics.actual)}</span></p>
            <p className="text-sm text-slate-700">Variance: <span className="font-semibold">{moneyLike(dailyMetrics.variance)}</span></p>
            <p className="text-sm text-slate-700">Achievement: <span className="font-semibold">{dailyMetrics.achievement.toFixed(2)}%</span></p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Weekly Production Plan</h2>
            <p className="mt-1 text-xs text-slate-500">{toDateInput(weekStart)} to {toDateInput(weekEnd)}</p>
            <p className="mt-3 text-sm text-slate-700">Planned: <span className="font-semibold">{moneyLike(weeklyMetrics.planned)}</span></p>
            <p className="text-sm text-slate-700">Actual: <span className="font-semibold">{moneyLike(weeklyMetrics.actual)}</span></p>
            <p className="text-sm text-slate-700">Variance: <span className="font-semibold">{moneyLike(weeklyMetrics.variance)}</span></p>
            <p className="text-sm text-slate-700">Achievement: <span className="font-semibold">{weeklyMetrics.achievement.toFixed(2)}%</span></p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Monthly Production Plan</h2>
            <p className="mt-1 text-xs text-slate-500">{toDateInput(monthStart)} to {toDateInput(monthEnd)}</p>
            <p className="mt-3 text-sm text-slate-700">Planned: <span className="font-semibold">{moneyLike(monthlyMetrics.planned)}</span></p>
            <p className="text-sm text-slate-700">Actual: <span className="font-semibold">{moneyLike(monthlyMetrics.actual)}</span></p>
            <p className="text-sm text-slate-700">Variance: <span className="font-semibold">{moneyLike(monthlyMetrics.variance)}</span></p>
            <p className="text-sm text-slate-700">Achievement: <span className="font-semibold">{monthlyMetrics.achievement.toFixed(2)}%</span></p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-cyan-50">
            <h2 className="text-sm font-semibold text-gray-900">Production Schedule</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Plan Date</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Order #</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Product</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Planned</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Actual</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Variance</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredPlans.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No production schedule rows found.</td></tr>
                ) : (
                  filteredPlans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-emerald-50/35">
                      <td className="px-4 py-2.5 text-sm text-gray-700">{String(plan.plan_date).slice(0, 10)}</td>
                      <td className="px-4 py-2.5 text-sm text-indigo-700 font-medium">{plan.order_number || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-800">{plan.product?.code || '-'} - {plan.product?.name || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{moneyLike(Number(plan.target_quantity || 0))}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-emerald-700 font-semibold">{moneyLike(Number(plan.actual_quantity || 0))}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-amber-700 font-semibold">{moneyLike(Number(plan.variance || 0))}</td>
                      <td className="px-4 py-2.5 text-sm">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(plan.normalized_status)}`}>
                          {statusLabel(plan.normalized_status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/70 bg-white/90 shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50 text-sm font-semibold text-gray-900">
              Pending Production Orders ({pendingProductionOrders.length})
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Order</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Product</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {pendingProductionOrders.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No pending production orders.</td></tr>
                  ) : (
                    pendingProductionOrders.map((plan) => (
                      <tr key={`pending-${plan.id}`}>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{String(plan.plan_date).slice(0, 10)}</td>
                        <td className="px-4 py-2.5 text-sm text-indigo-700">{plan.order_number || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-800">{plan.product?.code || '-'} - {plan.product?.name || '-'}</td>
                        <td className="px-4 py-2.5 text-sm">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(plan.normalized_status)}`}>
                            {statusLabel(plan.normalized_status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/90 shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-rose-50 to-orange-50 text-sm font-semibold text-gray-900">
              Overdue Production Orders ({overdueProductionOrders.length})
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Order</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Product</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {overdueProductionOrders.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No overdue production orders.</td></tr>
                  ) : (
                    overdueProductionOrders.map((plan) => (
                      <tr key={`overdue-${plan.id}`}>
                        <td className="px-4 py-2.5 text-sm text-gray-700">{String(plan.plan_date).slice(0, 10)}</td>
                        <td className="px-4 py-2.5 text-sm text-indigo-700">{plan.order_number || '-'}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-800">{plan.product?.code || '-'} - {plan.product?.name || '-'}</td>
                        <td className="px-4 py-2.5 text-sm">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass(plan.normalized_status)}`}>
                            {statusLabel(plan.normalized_status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-lg p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Production Order Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-600">Draft</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{statusSummary.draft}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-blue-600">Planned</p>
              <p className="mt-1 text-xl font-bold text-blue-900">{statusSummary.planned}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-amber-600">In Progress</p>
              <p className="mt-1 text-xl font-bold text-amber-900">{statusSummary.in_progress}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-emerald-600">Completed</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">{statusSummary.completed}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs uppercase tracking-[0.14em] text-rose-600">Cancelled</p>
              <p className="mt-1 text-xl font-bold text-rose-900">{statusSummary.cancelled}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
