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
  plan_date: string;
  shift?: string | null;
  target_quantity: number;
  status: 'draft' | 'scheduled' | 'order_created' | 'in_progress' | 'completed' | 'cancelled';
  order_number?: string | null;
  product?: Product;
};

type BatchRow = {
  id: number;
  production_plan_id?: number | null;
  produced_quantity: number;
  machine_name?: string | null;
  workstation_name?: string | null;
  worker_name?: string | null;
  status: 'started' | 'completed' | 'cancelled';
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  plan?: {
    id: number;
    plan_date?: string;
    shift?: string | null;
    order_number?: string | null;
  } | null;
  product?: Product;
};

type AccessUserRole = {
  name?: string;
  permissions?: Array<{ name?: string }>;
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

const qty = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

const normalizeShift = (value?: string | null) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'Unassigned';
  if (raw.includes('morning')) return 'Morning';
  if (raw.includes('evening')) return 'Evening';
  if (raw.includes('night')) return 'Night';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const normalizeDate = (value?: string | null) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const parseDateSafe = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dateInRange = (dateValue: string, fromDate: string, toDate: string) => {
  if (!dateValue) return false;
  if (fromDate && dateValue < fromDate) return false;
  if (toDate && dateValue > toDate) return false;
  return true;
};

export default function ProductionPerformanceReportsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [activeBatches, setActiveBatches] = useState<BatchRow[]>([]);
  const [historyBatches, setHistoryBatches] = useState<BatchRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    return toDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [toDate, setToDate] = useState(() => toDateInput(new Date()));

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
            ? (userData.roles as AccessUserRole[]).map((role) => String(role?.name || ''))
            : []),
        ]
          .map((role) => role.trim().toLowerCase())
          .filter(Boolean);

        const permissionNames = Array.isArray(userData?.roles)
          ? (userData.roles as AccessUserRole[]).flatMap((role) =>
              Array.isArray(role?.permissions)
                ? role.permissions.map((permission) => String(permission?.name || '').trim().toLowerCase())
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

        const hasReportPermission = permissionNames.some((permission) => permission.includes('report'));

        if (!isAdminUser && !hasReportPermission) {
          router.push('/dashboard');
          return;
        }

        await fetchData(token);
      } catch (error) {
        console.error('Error checking production performance report access:', error);
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
      console.error('Error loading production performance report:', error);
      setPlans([]);
      setActiveBatches([]);
      setHistoryBatches([]);
      setErrorMessage('Failed to load production performance data.');
    } finally {
      setLoading(false);
    }
  };

  const allBatches = useMemo(() => [...activeBatches, ...historyBatches], [activeBatches, historyBatches]);

  const plansById = useMemo(() => {
    const map = new Map<number, ProductionPlan>();
    plans.forEach((plan) => map.set(plan.id, plan));
    return map;
  }, [plans]);

  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => dateInRange(normalizeDate(plan.plan_date), fromDate, toDate));
  }, [plans, fromDate, toDate]);

  const filteredBatches = useMemo(() => {
    return allBatches.filter((batch) => {
      const eventTime = batch.completed_at || batch.started_at || batch.plan?.plan_date || null;
      const d = normalizeDate(eventTime);
      return dateInRange(d, fromDate, toDate);
    });
  }, [allBatches, fromDate, toDate]);

  const planActualMap = useMemo(() => {
    const map = new Map<number, number>();
    filteredBatches.forEach((batch) => {
      const planId = Number(batch.production_plan_id || batch.plan?.id || 0);
      if (!planId) return;
      map.set(planId, Number(map.get(planId) || 0) + Number(batch.produced_quantity || 0));
    });
    return map;
  }, [filteredBatches]);

  const productionAchievement = useMemo(() => {
    const planned = filteredPlans.reduce((sum, plan) => sum + Number(plan.target_quantity || 0), 0);
    const actual = filteredPlans.reduce((sum, plan) => sum + Number(planActualMap.get(plan.id) || 0), 0);
    const variance = planned - actual;
    const achievement = planned > 0 ? (actual / planned) * 100 : 0;
    return { planned, actual, variance, achievement };
  }, [filteredPlans, planActualMap]);

  const dailyShiftReport = useMemo(() => {
    const map = new Map<string, { date: string; shift: string; planned: number; actual: number }>();

    filteredPlans.forEach((plan) => {
      const date = normalizeDate(plan.plan_date);
      const shift = normalizeShift(plan.shift);
      const key = `${date}|${shift}`;
      if (!map.has(key)) {
        map.set(key, { date, shift, planned: 0, actual: 0 });
      }
      const row = map.get(key)!;
      row.planned += Number(plan.target_quantity || 0);
      row.actual += Number(planActualMap.get(plan.id) || 0);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.shift.localeCompare(b.shift);
    });
  }, [filteredPlans, planActualMap]);

  const machineWise = useMemo(() => {
    const map = new Map<string, number>();
    filteredBatches.forEach((batch) => {
      const key = String(batch.machine_name || 'Unassigned').trim() || 'Unassigned';
      map.set(key, Number(map.get(key) || 0) + Number(batch.produced_quantity || 0));
    });
    return Array.from(map.entries())
      .map(([machine, output]) => ({ machine, output }))
      .sort((a, b) => b.output - a.output);
  }, [filteredBatches]);

  const operatorWise = useMemo(() => {
    const map = new Map<string, number>();
    filteredBatches.forEach((batch) => {
      const key = String(batch.worker_name || 'Unassigned').trim() || 'Unassigned';
      map.set(key, Number(map.get(key) || 0) + Number(batch.produced_quantity || 0));
    });
    return Array.from(map.entries())
      .map(([operator, output]) => ({ operator, output }))
      .sort((a, b) => b.output - a.output);
  }, [filteredBatches]);

  const lineWise = useMemo(() => {
    const map = new Map<string, number>();
    filteredBatches.forEach((batch) => {
      const key = String(batch.workstation_name || 'Unassigned').trim() || 'Unassigned';
      map.set(key, Number(map.get(key) || 0) + Number(batch.produced_quantity || 0));
    });
    return Array.from(map.entries())
      .map(([line, output]) => ({ line, output }))
      .sort((a, b) => b.output - a.output);
  }, [filteredBatches]);

  const productWise = useMemo(() => {
    const map = new Map<string, number>();
    filteredBatches.forEach((batch) => {
      const productLabel = batch.product
        ? `${batch.product.code || '-'} - ${batch.product.name || '-'}`
        : (batch.production_plan_id && plansById.get(Number(batch.production_plan_id || 0))?.product
            ? `${plansById.get(Number(batch.production_plan_id || 0))?.product?.code || '-'} - ${plansById.get(Number(batch.production_plan_id || 0))?.product?.name || '-'}`
            : 'Unknown Product');
      map.set(productLabel, Number(map.get(productLabel) || 0) + Number(batch.produced_quantity || 0));
    });

    return Array.from(map.entries())
      .map(([product, output]) => ({ product, output }))
      .sort((a, b) => b.output - a.output);
  }, [filteredBatches, plansById]);

  const shiftWise = useMemo(() => {
    const map = new Map<string, number>();

    filteredBatches.forEach((batch) => {
      const planId = Number(batch.production_plan_id || batch.plan?.id || 0);
      const shift = normalizeShift(batch.plan?.shift || plansById.get(planId)?.shift || null);
      map.set(shift, Number(map.get(shift) || 0) + Number(batch.produced_quantity || 0));
    });

    return Array.from(map.entries())
      .map(([shift, output]) => ({ shift, output }))
      .sort((a, b) => b.output - a.output);
  }, [filteredBatches, plansById]);

  const hourly = useMemo(() => {
    const map = new Map<number, number>();

    filteredBatches.forEach((batch) => {
      const eventTime = batch.completed_at || batch.started_at || null;
      const dt = parseDateSafe(eventTime);
      if (!dt) return;
      const hour = dt.getHours();
      map.set(hour, Number(map.get(hour) || 0) + Number(batch.produced_quantity || 0));
    });

    const rows = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      output: Number(map.get(hour) || 0),
    }));

    return rows;
  }, [filteredBatches]);

  const statusSummary = useMemo(() => {
    const summary = {
      draft: 0,
      planned: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };

    filteredPlans.forEach((plan) => {
      if (plan.status === 'draft') summary.draft += 1;
      else if (plan.status === 'scheduled' || plan.status === 'order_created') summary.planned += 1;
      else if (plan.status === 'in_progress') summary.in_progress += 1;
      else if (plan.status === 'completed') summary.completed += 1;
      else if (plan.status === 'cancelled') summary.cancelled += 1;
    });

    return summary;
  }, [filteredPlans]);

  const renderSimpleTable = (
    title: string,
    columns: string[],
    rows: Array<Array<string | number>>,
    colSpan: number,
    emptyText: string
  ) => (
    <section className="rounded-2xl border border-white/70 bg-white/90 shadow-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-cyan-50">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-center text-sm text-gray-500">{emptyText}</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${title}-${index}`} className="hover:bg-emerald-50/35">
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${index}-${cellIndex}`} className="px-4 py-2.5 text-sm text-gray-700">{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

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
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Production Performance Reports</h1>
          <p className="mt-2 text-gray-600">Output analysis by day, machine, operator, line, product, shift and hour.</p>
        </div>

        {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}

        <section className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-black" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm text-black" />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setFromDate(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
                  setToDate(toDateInput(now));
                }}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Reset to Current Month
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Planned Quantity</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{qty(productionAchievement.planned)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Actual Quantity</p>
            <p className="mt-2 text-2xl font-bold text-cyan-900">{qty(productionAchievement.actual)}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Variance</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{qty(productionAchievement.variance)}</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Production Achievement</p>
            <p className="mt-2 text-2xl font-bold text-indigo-900">{productionAchievement.achievement.toFixed(2)}%</p>
          </div>
        </section>

        {renderSimpleTable(
          'Daily Production Report (Output by Day/Shift)',
          ['Date', 'Shift', 'Planned Quantity', 'Actual Quantity', 'Variance', 'Achievement %'],
          dailyShiftReport.map((row) => {
            const variance = row.planned - row.actual;
            const achievement = row.planned > 0 ? (row.actual / row.planned) * 100 : 0;
            return [row.date, row.shift, qty(row.planned), qty(row.actual), qty(variance), `${achievement.toFixed(2)}%`];
          }),
          6,
          'No daily production output rows found.'
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {renderSimpleTable(
            'Machine-wise Production (Output per Machine)',
            ['Machine', 'Output Quantity'],
            machineWise.map((row) => [row.machine, qty(row.output)]),
            2,
            'No machine-wise production data found.'
          )}

          {renderSimpleTable(
            'Employee/Operator-wise Production (Output per Operator)',
            ['Operator', 'Output Quantity'],
            operatorWise.map((row) => [row.operator, qty(row.output)]),
            2,
            'No operator-wise production data found.'
          )}

          {renderSimpleTable(
            'Line-wise Production (Output per Production Line)',
            ['Production Line', 'Output Quantity'],
            lineWise.map((row) => [row.line, qty(row.output)]),
            2,
            'No line-wise production data found.'
          )}

          {renderSimpleTable(
            'Product-wise Production (Quantity by Product)',
            ['Product', 'Output Quantity'],
            productWise.map((row) => [row.product, qty(row.output)]),
            2,
            'No product-wise production data found.'
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {renderSimpleTable(
            'Shift-wise Production (Morning/Evening/Night)',
            ['Shift', 'Output Quantity'],
            shiftWise.map((row) => [row.shift, qty(row.output)]),
            2,
            'No shift-wise production data found.'
          )}

          {renderSimpleTable(
            'Hourly Production (Output Hour-by-Hour)',
            ['Hour', 'Output Quantity'],
            hourly.map((row) => [`${String(row.hour).padStart(2, '0')}:00 - ${String(row.hour).padStart(2, '0')}:59`, qty(row.output)]),
            2,
            'No hourly production data found.'
          )}
        </div>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-lg p-4">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Production Plan Status Snapshot</h2>
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
