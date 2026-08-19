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
  machine_name?: string | null;
  worker_name?: string | null;
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
  unit_price?: number;
  purchase_price?: number;
};

type QcInspection = {
  id: number;
  production_order_id: number;
  inspection_date?: string;
  inspector_name?: string;
  quality_status?: 'approved' | 'rejected' | 'hold';
  approved_quantity?: number;
  rejected_quantity?: number;
  rejection_reason?: string;
  productionOrder?: {
    id: number;
    batch_no?: string;
    product?: Product;
    plan?: {
      order_number?: string;
      plan_date?: string;
    };
  };
};

type AccessUserRole = {
  name?: string;
  permissions?: Array<{ name?: string }>;
};

type MaterialUsageRow = {
  batchId: number;
  batchNo: string;
  date: string;
  orderNo: string;
  productLabel: string;
  machine: string;
  employee: string;
  producedQty: number;
  processWasteQty: number;
  materialCode: string;
  materialName: string;
  materialUnit: string;
  plannedQty: number;
  actualQty: number;
  materialWasteQty: number;
  recoverableQty: number;
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

const pct = (value: number) => `${Number(value || 0).toFixed(2)}%`;

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  };
};

export default function ProductionWastageScrapReportsPage() {
  const [token, setToken] = useState('');
  const [accessReady, setAccessReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeBatches, setActiveBatches] = useState<BatchRow[]>([]);
  const [historyBatches, setHistoryBatches] = useState<BatchRow[]>([]);
  const [qcInspections, setQcInspections] = useState<QcInspection[]>([]);
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
        console.error('Error checking wastage and scrap report access:', error);
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

      const [activeRes, historyRes, qcRes, inventoryRes] = await Promise.all([
        axios.get(`${API_URL}/api/production/execution/active-batches`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
        }),
        axios.get(`${API_URL}/api/production/execution/batch-history`, {
          headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
          params: { per_page: 1000 },
        }),
        axios.get(`${API_URL}/api/production/qc-inspections`, {
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
      setQcInspections(parseList(qcRes.data?.data || qcRes.data) as QcInspection[]);
      setInventory(parseList(inventoryRes.data?.data || inventoryRes.data) as InventoryItem[]);
    } catch (error) {
      console.error('Error loading wastage and scrap data:', error);
      setActiveBatches([]);
      setHistoryBatches([]);
      setQcInspections([]);
      setInventory([]);
      setErrorMessage('Failed to load wastage and scrap report data.');
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

  const batchMap = useMemo(() => {
    const map = new Map<number, BatchRow>();
    filteredBatches.forEach((batch) => map.set(batch.id, batch));
    return map;
  }, [filteredBatches]);

  const filteredQc = useMemo(() => {
    return qcInspections.filter((row) => {
      const d = normalizeDate(row.inspection_date || row.productionOrder?.plan?.plan_date || null);
      return dateInRange(d, fromDate, toDate);
    });
  }, [qcInspections, fromDate, toDate]);

  const materialUsageRows = useMemo<MaterialUsageRow[]>(() => {
    const rows: MaterialUsageRow[] = [];

    filteredBatches.forEach((batch) => {
      const plannedLines = Array.isArray(batch.material_requirements) ? batch.material_requirements.map(normalizeLine) : [];
      const actualLines = Array.isArray(batch.actual_material_consumption) ? batch.actual_material_consumption.map(normalizeLine) : plannedLines;
      const plannedByKey = new Map(plannedLines.map((line) => [lineKey(line), line]));
      const actualByKey = new Map(actualLines.map((line) => [lineKey(line), line]));
      const combinedKeys = new Set<string>([...plannedByKey.keys(), ...actualByKey.keys()]);

      combinedKeys.forEach((key) => {
        const planned = plannedByKey.get(key);
        const actual = actualByKey.get(key);
        const plannedQty = toNumber(planned?.required_quantity);
        const actualQty = toNumber(actual?.actual_quantity);
        const variance = actualQty - plannedQty;
        const materialWasteQty = variance > 0 ? variance : 0;
        const recoverableQty = variance < 0 ? Math.abs(variance) : 0;

        rows.push({
          batchId: batch.id,
          batchNo: String(batch.batch_no || `BATCH-${batch.id}`),
          date: normalizeDate(batch.completed_at || batch.started_at || batch.plan?.plan_date || null),
          orderNo: String(batch.plan?.order_number || '-'),
          productLabel: batch.product
            ? `${batch.product.code || '-'} - ${batch.product.name || '-'}`
            : 'Unknown Product',
          machine: String(batch.machine_name || 'Unassigned').trim() || 'Unassigned',
          employee: String(batch.worker_name || 'Unassigned').trim() || 'Unassigned',
          producedQty: toNumber(batch.produced_quantity),
          processWasteQty: toNumber(batch.wastage_quantity),
          materialCode: String(actual?.material_code || planned?.material_code || '-'),
          materialName: String(actual?.material_name || planned?.material_name || 'Unknown Material'),
          materialUnit: String(actual?.unit || planned?.unit || 'unit'),
          plannedQty,
          actualQty,
          materialWasteQty,
          recoverableQty,
        });
      });
    });

    return rows;
  }, [filteredBatches]);

  const inventoryCostByCode = useMemo(() => {
    const map = new Map<string, number>();
    inventory.forEach((row) => {
      const code = String(row.code || '').trim().toLowerCase();
      if (!code) return;
      const unitCost = toNumber(row.purchase_price ?? row.unit_price);
      map.set(code, unitCost);
    });
    return map;
  }, [inventory]);

  const materialTotals = useMemo(() => {
    const totalMaterialUsed = materialUsageRows.reduce((sum, row) => sum + row.actualQty, 0);
    const rawMaterialWaste = materialUsageRows.reduce((sum, row) => sum + row.materialWasteQty, 0);
    const processWaste = filteredBatches.reduce((sum, batch) => sum + toNumber(batch.wastage_quantity), 0);
    const finishedRejected = filteredQc.reduce((sum, row) => sum + toNumber(row.rejected_quantity), 0);
    const recoverable = materialUsageRows.reduce((sum, row) => sum + row.recoverableQty, 0);

    return {
      totalMaterialUsed,
      rawMaterialWaste,
      processWaste,
      finishedRejected,
      recoverable,
    };
  }, [materialUsageRows, filteredBatches, filteredQc]);

  const wasteKpi = useMemo(() => {
    const wasteQuantity = materialTotals.rawMaterialWaste;
    const base = materialTotals.totalMaterialUsed;
    const wastePercent = base > 0 ? (wasteQuantity / base) * 100 : 0;
    return {
      wasteQuantity,
      totalMaterialUsed: base,
      wastePercent,
    };
  }, [materialTotals]);

  const productionWasteReport = useMemo(() => {
    const byBatch = new Map<string, {
      date: string;
      batchNo: string;
      orderNo: string;
      product: string;
      materialUsed: number;
      materialWaste: number;
      processWaste: number;
    }>();

    materialUsageRows.forEach((row) => {
      if (!byBatch.has(row.batchNo)) {
        byBatch.set(row.batchNo, {
          date: row.date,
          batchNo: row.batchNo,
          orderNo: row.orderNo,
          product: row.productLabel,
          materialUsed: 0,
          materialWaste: 0,
          processWaste: row.processWasteQty,
        });
      }
      const target = byBatch.get(row.batchNo)!;
      target.materialUsed += row.actualQty;
      target.materialWaste += row.materialWasteQty;
    });

    return Array.from(byBatch.values())
      .map((row) => {
        const wastePct = row.materialUsed > 0 ? (row.materialWaste / row.materialUsed) * 100 : 0;
        return {
          ...row,
          wastePct,
        };
      })
      .sort((a, b) => b.wastePct - a.wastePct);
  }, [materialUsageRows]);

  const rawMaterialWasteReport = useMemo(() => {
    const map = new Map<string, { material: string; unit: string; used: number; waste: number }>();

    materialUsageRows.forEach((row) => {
      const key = `${row.materialCode}|${row.materialName}|${row.materialUnit}`;
      if (!map.has(key)) {
        map.set(key, {
          material: `${row.materialCode} - ${row.materialName}`,
          unit: row.materialUnit,
          used: 0,
          waste: 0,
        });
      }
      const target = map.get(key)!;
      target.used += row.actualQty;
      target.waste += row.materialWasteQty;
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        wastePct: row.used > 0 ? (row.waste / row.used) * 100 : 0,
      }))
      .sort((a, b) => b.wastePct - a.wastePct);
  }, [materialUsageRows]);

  const processWasteReport = useMemo(() => {
    return filteredBatches
      .map((batch) => {
        const produced = toNumber(batch.produced_quantity);
        const processWaste = toNumber(batch.wastage_quantity);
        const processed = produced + processWaste;
        const processWastePct = processed > 0 ? (processWaste / processed) * 100 : 0;
        return {
          date: normalizeDate(batch.completed_at || batch.started_at || batch.plan?.plan_date || null),
          batchNo: String(batch.batch_no || `BATCH-${batch.id}`),
          orderNo: String(batch.plan?.order_number || '-'),
          product: batch.product ? `${batch.product.code || '-'} - ${batch.product.name || '-'}` : 'Unknown Product',
          produced,
          processWaste,
          processWastePct,
        };
      })
      .sort((a, b) => b.processWastePct - a.processWastePct);
  }, [filteredBatches]);

  const finishedProductRejection = useMemo(() => {
    const map = new Map<string, { product: string; approved: number; rejected: number }>();

    filteredQc.forEach((row) => {
      const product = row.productionOrder?.product
        ? `${row.productionOrder.product.code || '-'} - ${row.productionOrder.product.name || '-'}`
        : 'Unknown Product';
      if (!map.has(product)) {
        map.set(product, { product, approved: 0, rejected: 0 });
      }
      const target = map.get(product)!;
      target.approved += toNumber(row.approved_quantity);
      target.rejected += toNumber(row.rejected_quantity);
    });

    return Array.from(map.values())
      .map((row) => {
        const inspected = row.approved + row.rejected;
        const rejectPct = inspected > 0 ? (row.rejected / inspected) * 100 : 0;
        return { ...row, inspected, rejectPct };
      })
      .sort((a, b) => b.rejectPct - a.rejectPct);
  }, [filteredQc]);

  const scrapReport = useMemo(() => {
    const totalRawScrap = materialTotals.rawMaterialWaste;
    const totalProcessScrap = materialTotals.processWaste;
    const totalRejectedScrap = materialTotals.finishedRejected;
    const totalScrap = totalRawScrap + totalProcessScrap + totalRejectedScrap;

    return [
      { source: 'Raw Material Scrap (Excess Consumption)', qty: totalRawScrap },
      { source: 'Process Scrap (Production Wastage)', qty: totalProcessScrap },
      { source: 'Finished Product Rejection Scrap', qty: totalRejectedScrap },
      { source: 'Total Scrap', qty: totalScrap },
    ];
  }, [materialTotals]);

  const wasteByProduct = useMemo(() => {
    const map = new Map<string, { product: string; used: number; waste: number }>();

    materialUsageRows.forEach((row) => {
      if (!map.has(row.productLabel)) {
        map.set(row.productLabel, { product: row.productLabel, used: 0, waste: 0 });
      }
      const target = map.get(row.productLabel)!;
      target.used += row.actualQty;
      target.waste += row.materialWasteQty;
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        wastePct: row.used > 0 ? (row.waste / row.used) * 100 : 0,
      }))
      .sort((a, b) => b.wastePct - a.wastePct);
  }, [materialUsageRows]);

  const wasteByMachine = useMemo(() => {
    const map = new Map<string, { machine: string; used: number; waste: number }>();

    materialUsageRows.forEach((row) => {
      if (!map.has(row.machine)) {
        map.set(row.machine, { machine: row.machine, used: 0, waste: 0 });
      }
      const target = map.get(row.machine)!;
      target.used += row.actualQty;
      target.waste += row.materialWasteQty;
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        wastePct: row.used > 0 ? (row.waste / row.used) * 100 : 0,
      }))
      .sort((a, b) => b.wastePct - a.wastePct);
  }, [materialUsageRows]);

  const wasteByEmployee = useMemo(() => {
    const map = new Map<string, { employee: string; used: number; waste: number }>();

    materialUsageRows.forEach((row) => {
      if (!map.has(row.employee)) {
        map.set(row.employee, { employee: row.employee, used: 0, waste: 0 });
      }
      const target = map.get(row.employee)!;
      target.used += row.actualQty;
      target.waste += row.materialWasteQty;
    });

    return Array.from(map.values())
      .map((row) => ({
        ...row,
        wastePct: row.used > 0 ? (row.waste / row.used) * 100 : 0,
      }))
      .sort((a, b) => b.wastePct - a.wastePct);
  }, [materialUsageRows]);

  const wasteCostReport = useMemo(() => {
    const map = new Map<string, { material: string; unit: string; wasteQty: number; unitCost: number; wasteCost: number }>();

    materialUsageRows.forEach((row) => {
      if (row.materialWasteQty <= 0) return;

      const key = `${row.materialCode}|${row.materialName}|${row.materialUnit}`;
      if (!map.has(key)) {
        const unitCost = toNumber(inventoryCostByCode.get(row.materialCode.trim().toLowerCase()) || 0);
        map.set(key, {
          material: `${row.materialCode} - ${row.materialName}`,
          unit: row.materialUnit,
          wasteQty: 0,
          unitCost,
          wasteCost: 0,
        });
      }

      const target = map.get(key)!;
      target.wasteQty += row.materialWasteQty;
      target.wasteCost = target.wasteQty * target.unitCost;
    });

    return Array.from(map.values()).sort((a, b) => b.wasteCost - a.wasteCost);
  }, [materialUsageRows, inventoryCostByCode]);

  const reusableScrapReport = useMemo(() => {
    const map = new Map<string, { material: string; unit: string; recoverableQty: number }>();

    materialUsageRows.forEach((row) => {
      if (row.recoverableQty <= 0) return;
      const key = `${row.materialCode}|${row.materialName}|${row.materialUnit}`;
      if (!map.has(key)) {
        map.set(key, {
          material: `${row.materialCode} - ${row.materialName}`,
          unit: row.materialUnit,
          recoverableQty: 0,
        });
      }
      map.get(key)!.recoverableQty += row.recoverableQty;
    });

    return Array.from(map.values()).sort((a, b) => b.recoverableQty - a.recoverableQty);
  }, [materialUsageRows]);

  const scrapDisposalReport = useMemo(() => {
    const rows = productionWasteReport.map((row) => {
      const batch = filteredBatches.find((b) => String(b.batch_no || `BATCH-${b.id}`) === row.batchNo);
      const qcRejected = filteredQc
        .filter((q) => Number(q.production_order_id) === Number(batch?.id || 0))
        .reduce((sum, q) => sum + toNumber(q.rejected_quantity), 0);

      const recoverable = materialUsageRows
        .filter((r) => r.batchNo === row.batchNo)
        .reduce((sum, r) => sum + r.recoverableQty, 0);

      const grossScrap = row.materialWaste + row.processWaste + qcRejected;
      const disposalQty = Math.max(0, grossScrap - recoverable);

      return {
        date: row.date,
        batchNo: row.batchNo,
        product: row.product,
        grossScrap,
        recoverable,
        disposalQty,
      };
    });

    return rows.sort((a, b) => b.disposalQty - a.disposalQty);
  }, [productionWasteReport, filteredBatches, filteredQc, materialUsageRows]);

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
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Wastage & Scrap Reports</h1>
          <p className="mt-2 text-gray-600">Daily production waste and scrap visibility for managers.</p>
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
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Waste Quantity</p>
            <p className="mt-2 text-2xl font-bold text-rose-900">{qty(wasteKpi.wasteQuantity)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Total Material Used</p>
            <p className="mt-2 text-2xl font-bold text-cyan-900">{qty(wasteKpi.totalMaterialUsed)}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Waste % KPI</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{pct(wasteKpi.wastePercent)}</p>
          </div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Formula</p>
            <p className="mt-2 text-sm font-semibold text-indigo-900">Waste % = Waste Quantity / Total Material Used x 100</p>
          </div>
        </section>

        {renderTable(
          'Production Waste Report',
          ['Date', 'Batch/Lot', 'Order No', 'Product', 'Material Used', 'Material Waste', 'Process Waste', 'Waste %'],
          productionWasteReport.map((row) => [
            row.date,
            row.batchNo,
            row.orderNo,
            row.product,
            qty(row.materialUsed),
            qty(row.materialWaste),
            qty(row.processWaste),
            pct(row.wastePct),
          ]),
          8,
          'No production waste rows found in selected date range.'
        )}

        {renderTable(
          'Raw Material Waste',
          ['Material', 'Material Used', 'Material Waste', 'Waste %', 'Unit'],
          rawMaterialWasteReport.map((row) => [row.material, qty(row.used), qty(row.waste), pct(row.wastePct), row.unit]),
          5,
          'No raw material waste rows found.'
        )}

        {renderTable(
          'Process Waste',
          ['Date', 'Batch/Lot', 'Order No', 'Product', 'Produced Qty', 'Process Waste Qty', 'Process Waste %'],
          processWasteReport.map((row) => [row.date, row.batchNo, row.orderNo, row.product, qty(row.produced), qty(row.processWaste), pct(row.processWastePct)]),
          7,
          'No process waste rows found.'
        )}

        {renderTable(
          'Finished Product Rejection',
          ['Product', 'Approved Qty', 'Rejected Qty', 'Inspected Qty', 'Rejection %'],
          finishedProductRejection.map((row) => [row.product, qty(row.approved), qty(row.rejected), qty(row.inspected), pct(row.rejectPct)]),
          5,
          'No finished-product rejection rows found.'
        )}

        {renderTable(
          'Scrap Report',
          ['Scrap Source', 'Quantity'],
          scrapReport.map((row) => [row.source, qty(row.qty)]),
          2,
          'No scrap rows found.'
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {renderTable(
            'Waste % by Product',
            ['Product', 'Material Used', 'Waste Qty', 'Waste %'],
            wasteByProduct.map((row) => [row.product, qty(row.used), qty(row.waste), pct(row.wastePct)]),
            4,
            'No product-wise waste data found.'
          )}

          {renderTable(
            'Waste % by Machine',
            ['Machine', 'Material Used', 'Waste Qty', 'Waste %'],
            wasteByMachine.map((row) => [row.machine, qty(row.used), qty(row.waste), pct(row.wastePct)]),
            4,
            'No machine-wise waste data found.'
          )}

          {renderTable(
            'Waste % by Employee',
            ['Employee', 'Material Used', 'Waste Qty', 'Waste %'],
            wasteByEmployee.map((row) => [row.employee, qty(row.used), qty(row.waste), pct(row.wastePct)]),
            4,
            'No employee-wise waste data found.'
          )}
        </div>

        {renderTable(
          'Waste Cost Report',
          ['Material', 'Waste Qty', 'Unit Cost', 'Waste Cost', 'Unit'],
          wasteCostReport.map((row) => [row.material, qty(row.wasteQty), money(row.unitCost), money(row.wasteCost), row.unit]),
          5,
          'No waste cost rows found.'
        )}

        {renderTable(
          'Reusable Scrap Report',
          ['Material', 'Recoverable Qty', 'Unit'],
          reusableScrapReport.map((row) => [row.material, qty(row.recoverableQty), row.unit]),
          3,
          'No reusable scrap rows found.',
          'Recoverable quantity is inferred where actual material usage is less than planned usage for a batch.'
        )}

        {renderTable(
          'Scrap Disposal Report',
          ['Date', 'Batch/Lot', 'Product', 'Gross Scrap', 'Recoverable', 'Disposal Qty'],
          scrapDisposalReport.map((row) => [row.date, row.batchNo, row.product, qty(row.grossScrap), qty(row.recoverable), qty(row.disposalQty)]),
          6,
          'No scrap disposal rows found.',
          'Disposal quantity is estimated as gross scrap minus recoverable quantity.'
        )}
      </main>
    </div>
  );
}
