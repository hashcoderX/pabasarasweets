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

type MaterialLine = {
  material_id?: number;
  inventory_item_id?: number;
  material_name?: string;
  material_code?: string;
  unit?: string;
  required_quantity?: number;
  consumed_quantity?: number;
  actual_quantity?: number;
  available_before?: number;
  available_after?: number;
};

type BatchRow = {
  id: number;
  batch_no?: string | null;
  production_plan_id?: number | null;
  production_quantity?: number;
  produced_quantity?: number;
  wastage_quantity?: number;
  status: 'started' | 'completed' | 'cancelled';
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  material_requirements?: MaterialLine[] | null;
  actual_material_consumption?: MaterialLine[] | null;
  plan?: {
    id: number;
    plan_date?: string;
    shift?: string | null;
    order_number?: string | null;
  } | null;
  product?: Product;
};

type InventoryItem = {
  id: number;
  code?: string;
  name?: string;
  unit?: string;
  type?: string;
  current_stock?: number;
  minimum_stock?: number;
};

type AccessUserRole = {
  name?: string;
  permissions?: Array<{ name?: string }>;
};

type ConsumptionRow = {
  batchId: number;
  batchNo: string;
  planOrderNo: string;
  eventDate: string;
  productLabel: string;
  producedQty: number;
  wastageQty: number;
  materialCode: string;
  materialName: string;
  materialUnit: string;
  plannedQty: number;
  actualQty: number;
  varianceQty: number;
  returnedQty: number;
  availableBefore?: number;
  availableAfter?: number;
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

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeDate = (value?: string | null): string => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const dateInRange = (dateValue: string, fromDate: string, toDate: string): boolean => {
  if (!dateValue) return false;
  if (fromDate && dateValue < fromDate) return false;
  if (toDate && dateValue > toDate) return false;
  return true;
};

const lineKey = (line: MaterialLine): string => {
  if (line.inventory_item_id) return `inv-${line.inventory_item_id}`;
  if (line.material_id) return `mat-${line.material_id}`;
  if (line.material_code) return `code-${line.material_code.trim().toLowerCase()}`;
  return `name-${String(line.material_name || 'unknown').trim().toLowerCase()}`;
};

const normalizeLine = (line: MaterialLine): MaterialLine => {
  const actual =
    line.actual_quantity !== undefined
      ? toNumber(line.actual_quantity)
      : line.consumed_quantity !== undefined
        ? toNumber(line.consumed_quantity)
        : line.required_quantity !== undefined
          ? toNumber(line.required_quantity)
          : 0;

  return {
    ...line,
    required_quantity: toNumber(line.required_quantity),
    actual_quantity: actual,
    available_before: line.available_before === undefined ? undefined : toNumber(line.available_before),
    available_after: line.available_after === undefined ? undefined : toNumber(line.available_after),
  };
};

export default function ProductionRawMaterialConsumptionReportsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeBatches, setActiveBatches] = useState<BatchRow[]>([]);
  const [historyBatches, setHistoryBatches] = useState<BatchRow[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
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
        console.error('Error checking raw material consumption report access:', error);
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

      const [activeRes, historyRes, inventoryRes] = await Promise.all([
        axios.get(`${API_URL}/api/production/execution/active-batches`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        }),
        axios.get(`${API_URL}/api/production/execution/batch-history`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          params: { per_page: 1000 },
        }),
        axios.get(`${API_URL}/api/stock/inventory`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          params: { type: 'raw_material', per_page: 1000 },
        }),
      ]);

      setActiveBatches(parseList(activeRes.data?.data || activeRes.data) as BatchRow[]);
      setHistoryBatches(parseList(historyRes.data?.data || historyRes.data) as BatchRow[]);
      setInventory(parseList(inventoryRes.data?.data || inventoryRes.data) as InventoryItem[]);
    } catch (error) {
      console.error('Error loading raw material consumption data:', error);
      setActiveBatches([]);
      setHistoryBatches([]);
      setInventory([]);
      setErrorMessage('Failed to load raw material consumption report data.');
    } finally {
      setLoading(false);
    }
  };

  const allBatches = useMemo(() => [...activeBatches, ...historyBatches], [activeBatches, historyBatches]);

  const filteredBatches = useMemo(() => {
    return allBatches.filter((batch) => {
      const eventDate = normalizeDate(batch.completed_at || batch.started_at || batch.plan?.plan_date || null);
      return dateInRange(eventDate, fromDate, toDate);
    });
  }, [allBatches, fromDate, toDate]);

  const normalizedConsumptionRows = useMemo<ConsumptionRow[]>(() => {
    const rows: ConsumptionRow[] = [];

    filteredBatches.forEach((batch) => {
      const plannedLines = Array.isArray(batch.material_requirements) ? batch.material_requirements.map(normalizeLine) : [];
      const actualLines = Array.isArray(batch.actual_material_consumption) ? batch.actual_material_consumption.map(normalizeLine) : plannedLines;
      const actualByKey = new Map(actualLines.map((line) => [lineKey(line), line]));
      const plannedByKey = new Map(plannedLines.map((line) => [lineKey(line), line]));
      const combinedKeys = new Set<string>([...actualByKey.keys(), ...plannedByKey.keys()]);

      combinedKeys.forEach((key) => {
        const p = plannedByKey.get(key);
        const a = actualByKey.get(key);
        const plannedQty = toNumber(p?.required_quantity);
        const actualQty = toNumber(a?.actual_quantity);
        const varianceQty = actualQty - plannedQty;
        const returnedQty = varianceQty < 0 ? Math.abs(varianceQty) : 0;
        const materialCode = String(a?.material_code || p?.material_code || '-');
        const materialName = String(a?.material_name || p?.material_name || 'Unknown Material');
        const materialUnit = String(a?.unit || p?.unit || 'unit');

        rows.push({
          batchId: Number(batch.id || 0),
          batchNo: String(batch.batch_no || `BATCH-${batch.id}`),
          planOrderNo: String(batch.plan?.order_number || '-'),
          eventDate: normalizeDate(batch.completed_at || batch.started_at || batch.plan?.plan_date || null),
          productLabel: batch.product
            ? `${batch.product.code || '-'} - ${batch.product.name || '-'}`
            : 'Unknown Product',
          producedQty: toNumber(batch.produced_quantity),
          wastageQty: toNumber(batch.wastage_quantity),
          materialCode,
          materialName,
          materialUnit,
          plannedQty,
          actualQty,
          varianceQty,
          returnedQty,
          availableBefore: a?.available_before ?? p?.available_before,
          availableAfter: a?.available_after ?? p?.available_after,
        });
      });
    });

    return rows;
  }, [filteredBatches]);

  const baseConsumptionSummary = useMemo(() => {
    const totalPlanned = normalizedConsumptionRows.reduce((sum, row) => sum + row.plannedQty, 0);
    const totalActual = normalizedConsumptionRows.reduce((sum, row) => sum + row.actualQty, 0);
    const totalVariance = totalActual - totalPlanned;
    const totalReturned = normalizedConsumptionRows.reduce((sum, row) => sum + row.returnedQty, 0);
    return { totalPlanned, totalActual, totalVariance, totalReturned };
  }, [normalizedConsumptionRows]);

  const rawMaterialConsumptionReport = useMemo(() => {
    const map = new Map<string, { material: string; unit: string; planned: number; actual: number; variance: number }>();

    normalizedConsumptionRows.forEach((row) => {
      const key = `${row.materialCode}|${row.materialName}|${row.materialUnit}`;
      if (!map.has(key)) {
        map.set(key, { material: `${row.materialCode} - ${row.materialName}`, unit: row.materialUnit, planned: 0, actual: 0, variance: 0 });
      }
      const target = map.get(key)!;
      target.planned += row.plannedQty;
      target.actual += row.actualQty;
      target.variance += row.varianceQty;
    });

    return Array.from(map.values()).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }, [normalizedConsumptionRows]);

  const productWiseConsumption = useMemo(() => {
    const map = new Map<string, { product: string; planned: number; actual: number; variance: number }>();

    normalizedConsumptionRows.forEach((row) => {
      if (!map.has(row.productLabel)) {
        map.set(row.productLabel, { product: row.productLabel, planned: 0, actual: 0, variance: 0 });
      }
      const target = map.get(row.productLabel)!;
      target.planned += row.plannedQty;
      target.actual += row.actualQty;
      target.variance += row.varianceQty;
    });

    return Array.from(map.values()).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  }, [normalizedConsumptionRows]);

  const productionOrderConsumption = useMemo(() => {
    const map = new Map<string, { batchNo: string; orderNo: string; product: string; date: string; planned: number; actual: number; variance: number }>();

    normalizedConsumptionRows.forEach((row) => {
      const key = row.batchNo;
      if (!map.has(key)) {
        map.set(key, {
          batchNo: row.batchNo,
          orderNo: row.planOrderNo,
          product: row.productLabel,
          date: row.eventDate,
          planned: 0,
          actual: 0,
          variance: 0,
        });
      }
      const target = map.get(key)!;
      target.planned += row.plannedQty;
      target.actual += row.actualQty;
      target.variance += row.varianceQty;
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [normalizedConsumptionRows]);

  const plannedVsActualConsumption = useMemo(() => {
    const map = new Map<string, { material: string; unit: string; planned: number; actual: number; produced: number }>();

    normalizedConsumptionRows.forEach((row) => {
      const key = `${row.materialCode}|${row.materialName}|${row.materialUnit}`;
      if (!map.has(key)) {
        map.set(key, {
          material: `${row.materialCode} - ${row.materialName}`,
          unit: row.materialUnit,
          planned: 0,
          actual: 0,
          produced: 0,
        });
      }
      const target = map.get(key)!;
      target.planned += row.plannedQty;
      target.actual += row.actualQty;
      target.produced += row.producedQty;
    });

    return Array.from(map.values())
      .map((row) => {
        const plannedPerUnit = row.produced > 0 ? row.planned / row.produced : 0;
        const actualPerUnit = row.produced > 0 ? row.actual / row.produced : 0;
        const excessPerUnit = actualPerUnit - plannedPerUnit;
        return {
          ...row,
          plannedPerUnit,
          actualPerUnit,
          excessPerUnit,
        };
      })
      .sort((a, b) => b.excessPerUnit - a.excessPerUnit);
  }, [normalizedConsumptionRows]);

  const materialWastageReport = useMemo(() => {
    const map = new Map<string, { material: string; unit: string; excess: number; productionWastage: number }>();

    normalizedConsumptionRows.forEach((row) => {
      const key = `${row.materialCode}|${row.materialName}|${row.materialUnit}`;
      if (!map.has(key)) {
        map.set(key, { material: `${row.materialCode} - ${row.materialName}`, unit: row.materialUnit, excess: 0, productionWastage: 0 });
      }
      const target = map.get(key)!;
      if (row.varianceQty > 0) {
        target.excess += row.varianceQty;
      }
      target.productionWastage += row.wastageQty;
    });

    return Array.from(map.values()).sort((a, b) => b.excess - a.excess);
  }, [normalizedConsumptionRows]);

  const materialVarianceReport = useMemo(() => {
    return normalizedConsumptionRows
      .map((row) => {
        const variancePct = row.plannedQty > 0 ? (row.varianceQty / row.plannedQty) * 100 : 0;
        return {
          ...row,
          variancePct,
        };
      })
      .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct));
  }, [normalizedConsumptionRows]);

  const batchLotWiseUsage = useMemo(() => {
    return normalizedConsumptionRows
      .map((row) => ({
        batchNo: row.batchNo,
        date: row.eventDate,
        product: row.productLabel,
        material: `${row.materialCode} - ${row.materialName}`,
        planned: row.plannedQty,
        actual: row.actualQty,
        unit: row.materialUnit,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [normalizedConsumptionRows]);

  const materialReturnToStore = useMemo(() => {
    return normalizedConsumptionRows
      .filter((row) => row.returnedQty > 0)
      .map((row) => ({
        batchNo: row.batchNo,
        date: row.eventDate,
        product: row.productLabel,
        material: `${row.materialCode} - ${row.materialName}`,
        returned: row.returnedQty,
        unit: row.materialUnit,
      }))
      .sort((a, b) => b.returned - a.returned);
  }, [normalizedConsumptionRows]);

  const materialShortageReport = useMemo(() => {
    const inventoryByCode = new Map<string, InventoryItem>();
    inventory.forEach((item) => {
      const code = String(item.code || '').trim().toLowerCase();
      if (code) inventoryByCode.set(code, item);
    });

    const consumptionByMaterial = new Map<string, number>();
    normalizedConsumptionRows.forEach((row) => {
      const codeKey = row.materialCode.trim().toLowerCase();
      if (!codeKey || codeKey === '-') return;
      consumptionByMaterial.set(codeKey, (consumptionByMaterial.get(codeKey) || 0) + row.actualQty);
    });

    return inventory
      .filter((item) => String(item.type || '').toLowerCase() === 'raw_material')
      .map((item) => {
        const current = toNumber(item.current_stock);
        const minimum = toNumber(item.minimum_stock);
        const codeKey = String(item.code || '').trim().toLowerCase();
        const consumedInRange = toNumber(consumptionByMaterial.get(codeKey) || 0);
        const shortageQty = Math.max(0, minimum - current);
        const shortageRisk = current <= 0 ? 'Out of Stock' : current <= minimum ? 'Below Minimum' : 'Healthy';
        return {
          code: String(item.code || '-'),
          name: String(item.name || '-'),
          unit: String(item.unit || 'unit'),
          current,
          minimum,
          consumedInRange,
          shortageQty,
          shortageRisk,
        };
      })
      .filter((row) => row.shortageRisk !== 'Healthy' || row.shortageQty > 0)
      .sort((a, b) => b.shortageQty - a.shortageQty);
  }, [inventory, normalizedConsumptionRows]);

  const highestExcessPerUnit = useMemo(() => {
    const positive = plannedVsActualConsumption.filter((row) => row.excessPerUnit > 0);
    if (positive.length === 0) return null;
    return positive[0];
  }, [plannedVsActualConsumption]);

  const renderTable = (
    title: string,
    columns: string[],
    rows: Array<Array<string | number>>,
    colSpan: number,
    emptyText: string,
    footNote?: string
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
      {footNote ? <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-600">{footNote}</div> : null}
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
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Raw Material Consumption Reports</h1>
          <p className="mt-2 text-gray-600">Critical inventory-facing production report to detect excess usage, variance, and stock leakage.</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Planned Consumption</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{qty(baseConsumptionSummary.totalPlanned)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Actual Consumption</p>
            <p className="mt-2 text-2xl font-bold text-cyan-900">{qty(baseConsumptionSummary.totalActual)}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Variance (Actual - Planned)</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{qty(baseConsumptionSummary.totalVariance)}</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Inferred Return to Store</p>
            <p className="mt-2 text-2xl font-bold text-indigo-900">{qty(baseConsumptionSummary.totalReturned)}</p>
          </div>
        </section>

        {highestExcessPerUnit ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Leakage Alert</p>
            <p className="mt-2 text-sm text-rose-900">
              {highestExcessPerUnit.material}: Planned {qty(highestExcessPerUnit.plannedPerUnit)} {highestExcessPerUnit.unit}/unit, Actual {qty(highestExcessPerUnit.actualPerUnit)} {highestExcessPerUnit.unit}/unit,
              Excess {qty(highestExcessPerUnit.excessPerUnit)} {highestExcessPerUnit.unit}/unit.
            </p>
          </section>
        ) : null}

        {renderTable(
          'Raw Material Consumption Report',
          ['Material', 'Planned Qty', 'Actual Qty', 'Variance', 'Unit'],
          rawMaterialConsumptionReport.map((row) => [row.material, qty(row.planned), qty(row.actual), qty(row.variance), row.unit]),
          5,
          'No material consumption records found in selected date range.'
        )}

        {renderTable(
          'Product-wise Material Consumption',
          ['Product', 'Planned Qty', 'Actual Qty', 'Variance'],
          productWiseConsumption.map((row) => [row.product, qty(row.planned), qty(row.actual), qty(row.variance)]),
          4,
          'No product-wise consumption data found.'
        )}

        {renderTable(
          'Production Order Material Consumption',
          ['Date', 'Batch/Lot', 'Order No', 'Product', 'Planned Qty', 'Actual Qty', 'Variance'],
          productionOrderConsumption.map((row) => [row.date, row.batchNo, row.orderNo, row.product, qty(row.planned), qty(row.actual), qty(row.variance)]),
          7,
          'No production order material consumption found.'
        )}

        {renderTable(
          'Planned vs Actual Material Consumption',
          ['Material', 'Planned Total', 'Actual Total', 'Planned/Unit', 'Actual/Unit', 'Excess/Unit', 'Unit'],
          plannedVsActualConsumption.map((row) => [
            row.material,
            qty(row.planned),
            qty(row.actual),
            qty(row.plannedPerUnit),
            qty(row.actualPerUnit),
            qty(row.excessPerUnit),
            row.unit,
          ]),
          7,
          'No planned vs actual material data found.'
        )}

        {renderTable(
          'Material Wastage Report',
          ['Material', 'Excess Material Usage', 'Production Wastage Qty', 'Unit'],
          materialWastageReport.map((row) => [row.material, qty(row.excess), qty(row.productionWastage), row.unit]),
          4,
          'No material wastage data found.'
        )}

        {renderTable(
          'Material Variance Report',
          ['Date', 'Batch/Lot', 'Material', 'Planned Qty', 'Actual Qty', 'Variance', 'Variance %', 'Unit'],
          materialVarianceReport.map((row) => [
            row.eventDate,
            row.batchNo,
            `${row.materialCode} - ${row.materialName}`,
            qty(row.plannedQty),
            qty(row.actualQty),
            qty(row.varianceQty),
            `${row.variancePct.toFixed(2)}%`,
            row.materialUnit,
          ]),
          8,
          'No variance rows found.'
        )}

        {renderTable(
          'Batch/Lot-wise Material Usage',
          ['Date', 'Batch/Lot', 'Product', 'Material', 'Planned Qty', 'Actual Qty', 'Unit'],
          batchLotWiseUsage.map((row) => [row.date, row.batchNo, row.product, row.material, qty(row.planned), qty(row.actual), row.unit]),
          7,
          'No batch/lot-wise usage data found.'
        )}

        {renderTable(
          'Material Return to Store',
          ['Date', 'Batch/Lot', 'Product', 'Material', 'Returned Qty', 'Unit'],
          materialReturnToStore.map((row) => [row.date, row.batchNo, row.product, row.material, qty(row.returned), row.unit]),
          6,
          'No return-to-store quantities detected in selected range.',
          'This section is inferred from planned minus actual consumption where actual is lower than planned.'
        )}

        {renderTable(
          'Material Shortage Report',
          ['Material Code', 'Material Name', 'Current Stock', 'Minimum Stock', 'Consumed (Range)', 'Shortage Qty', 'Risk', 'Unit'],
          materialShortageReport.map((row) => [
            row.code,
            row.name,
            qty(row.current),
            qty(row.minimum),
            qty(row.consumedInRange),
            qty(row.shortageQty),
            row.shortageRisk,
            row.unit,
          ]),
          8,
          'No shortages below minimum stock level detected.'
        )}
      </main>
    </div>
  );
}
