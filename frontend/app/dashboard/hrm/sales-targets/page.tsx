'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios, { isAxiosError } from '@/lib/http';

type TargetType = 'employee' | 'branch' | 'product' | 'territory';
type Tab = 'setup' | TargetType | 'performance';

type Target = {
  id: number;
  target_type: TargetType;
  employee_id?: number | null;
  branch_id?: number | null;
  inventory_item_id?: number | null;
  route_id?: number | null;
  period_key: string;
  period_start: string;
  period_end: string;
  target_amount: number;
  target_quantity: number;
  achieved_amount: number;
  achieved_quantity: number;
  notes?: string | null;
  is_active: boolean;
  all_products?: boolean;
  products?: Array<{ product?: { code?: string; name?: string } }>;
  territories?: Array<{ territory?: { name?: string; origin?: string; destination?: string } }>;
  employee?: { employee_code?: string; first_name?: string; last_name?: string };
  branch?: { name?: string };
  product?: { code?: string; name?: string };
  territory?: { name?: string; origin?: string; destination?: string };
};

type Option = { id: number; name?: string; first_name?: string; last_name?: string; employee_code?: string; code?: string; origin?: string; destination?: string };
type ConfirmAction = (() => void | Promise<void>) | null;

const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'setup', label: 'Target Setup' },
  { key: 'employee', label: 'Employee Targets' },
  { key: 'branch', label: 'Branch Targets' },
  { key: 'product', label: 'Product Targets' },
  { key: 'territory', label: 'Territory Targets' },
  { key: 'performance', label: 'Target Performance' },
];

export default function SalesTargetsPage() {
  const [token, setToken] = useState('');
  const [tab, setTab] = useState<Tab>('setup');
  const [targets, setTargets] = useState<Target[]>([]);
  const [employees, setEmployees] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [products, setProducts] = useState<Option[]>([]);
  const [territories, setTerritories] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alertModal, setAlertModal] = useState({ open: false, title: '', message: '' });
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', confirmText: 'Confirm', cancelText: 'Cancel', destructive: false });
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [productSearch, setProductSearch] = useState('');
  const [territorySearch, setTerritorySearch] = useState('');
  const [productQuantities, setProductQuantities] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ target_type: 'employee' as TargetType, employee_id: '', branch_id: '', inventory_item_id: '', route_id: '', product_ids: [] as string[], territory_ids: [] as string[], all_products: true, period_key: new Date().toISOString().slice(0, 7), period_start: `${new Date().toISOString().slice(0, 7)}-01`, period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10), target_amount: '', target_quantity: '', notes: '' });
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (!stored) router.push('/');
    else setToken(stored);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get('/api/sales-targets', { headers, params: { per_page: 500 } }),
      axios.get('/api/hr/employees', { headers, params: { per_page: 1000 } }),
      axios.get('/api/companies', { headers, params: { per_page: 1000 } }),
      axios.get('/api/stock/inventory', { headers, params: { per_page: 1000 } }),
      axios.get('/api/vehicle-loading/routes', { headers }),
    ]).then(([targetRes, employeeRes, branchRes, productRes, territoryRes]) => {
      const targetData = targetRes.data?.data;
      setTargets(Array.isArray(targetData?.data) ? targetData.data : Array.isArray(targetData) ? targetData : []);
      setEmployees(Array.isArray(employeeRes.data) ? employeeRes.data : employeeRes.data?.data || []);
      setBranches(Array.isArray(branchRes.data) ? branchRes.data : branchRes.data?.data || []);
      const productsData = productRes.data?.data?.data || productRes.data?.data || productRes.data || [];
      setProducts(Array.isArray(productsData) ? productsData.filter((item: Option & { status?: string }) => item.status !== 'inactive') : []);
      setTerritories(Array.isArray(territoryRes.data) ? territoryRes.data : territoryRes.data?.data || []);
    }).catch(() => setAlertModal({ open: true, title: 'Load failed', message: 'Unable to load target setup data.' })).finally(() => setLoading(false));
  }, [token]);

  const openAlert = (title: string, message: string) => {
    setAlertModal({ open: true, title, message });
  };

  const openConfirm = ({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', destructive = false, action }: { title: string; message: string; confirmText?: string; cancelText?: string; destructive?: boolean; action: () => void | Promise<void> }) => {
    setConfirmModal({ open: true, title, message, confirmText, cancelText, destructive });
    setConfirmAction(() => action);
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      await confirmAction();
      setConfirmModal((current) => ({ ...current, open: false }));
      setConfirmAction(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const visibleTargets = useMemo(() => tab === 'setup' || tab === 'performance' ? targets : targets.filter((target) => target.target_type === tab), [tab, targets]);

  const filteredProducts = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => `${product.code || ''} ${product.name || ''}`.toLowerCase().includes(needle));
  }, [productSearch, products]);

  const filteredTerritories = useMemo(() => {
    const needle = territorySearch.trim().toLowerCase();
    if (!needle) return territories;
    return territories.filter((territory) => {
      const label = territory.name || `${territory.origin || ''} to ${territory.destination || ''}`;
      return label.toLowerCase().includes(needle);
    });
  }, [territorySearch, territories]);

  const formatDateValue = (value?: string) => {
    if (!value) return '-';
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-CA');
  };

  const formatAmount = (value: unknown) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '0.00';
    return amount.toFixed(2);
  };

  const labelFor = (target: Target) => {
    if (target.target_type === 'employee') return `${target.employee?.first_name || ''} ${target.employee?.last_name || ''}`.trim() || target.employee?.employee_code || '-';
    if (target.target_type === 'branch') return target.branch?.name || '-';
    if (target.target_type === 'product') return target.all_products ? 'All products' : target.products?.map((item) => item.product?.name || item.product?.code).filter(Boolean).join(', ') || target.product?.name || target.product?.code || '-';
    return target.territories?.map((item) => item.territory?.name || [item.territory?.origin, item.territory?.destination].filter(Boolean).join(' to ')).filter(Boolean).join(', ') || target.territory?.name || [target.territory?.origin, target.territory?.destination].filter(Boolean).join(' to ') || '-';
  };

  const toggleProductId = (value: string) => {
    setForm((current) => {
      const exists = current.product_ids.includes(value);
      if (exists) {
        setProductQuantities((quantities) => {
          const next = { ...quantities };
          delete next[value];
          return next;
        });
      } else {
        setProductQuantities((quantities) => ({ ...quantities, [value]: quantities[value] ?? '' }));
      }
      return {
        ...current,
        product_ids: exists ? current.product_ids.filter((id) => id !== value) : [...current.product_ids, value],
      };
    });
  };

  const toggleTerritoryId = (value: string) => {
    setForm((current) => ({
      ...current,
      territory_ids: current.territory_ids.includes(value)
        ? current.territory_ids.filter((id) => id !== value)
        : [...current.territory_ids, value],
    }));
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

    if (!form.period_key.trim()) nextErrors.period_key = 'Period key is required.';
    else if (!periodPattern.test(form.period_key.trim())) nextErrors.period_key = 'Use YYYY-MM format.';

    if (!form.period_start) nextErrors.period_start = 'Start date is required.';
    if (!form.period_end) nextErrors.period_end = 'End date is required.';
    if (form.period_start && form.period_end && form.period_end < form.period_start) {
      nextErrors.period_end = 'End date must be after or equal to start date.';
    }

    if (form.target_type === 'employee' && !form.employee_id) nextErrors.employee_id = 'Please select an employee.';
    if (form.target_type === 'branch' && !form.branch_id) nextErrors.branch_id = 'Please select a branch.';
    if (form.target_type === 'territory' && form.territory_ids.length === 0) nextErrors.territory_ids = 'Select at least one territory.';

    if (!form.target_amount.trim()) nextErrors.target_amount = 'Target amount is required.';
    else if (Number.isNaN(Number(form.target_amount)) || Number(form.target_amount) < 0) {
      nextErrors.target_amount = 'Target amount must be a valid positive number.';
    }

    if (!form.all_products && form.target_quantity.trim()) {
      if (Number.isNaN(Number(form.target_quantity)) || Number(form.target_quantity) < 0) {
        nextErrors.target_quantity = 'Target quantity must be a valid positive number.';
      }
    }

    if (form.target_type === 'product' && !form.all_products) {
      if (!form.product_ids.length) {
        nextErrors.product_ids = 'Select at least one product.';
      }

      form.product_ids.forEach((id) => {
        const qty = productQuantities[id] || '';
        if (!qty.trim()) {
          nextErrors[`product_qty_${id}`] = 'Required';
          return;
        }
        const value = Number(qty);
        if (Number.isNaN(value) || value < 0) {
          nextErrors[`product_qty_${id}`] = 'Invalid qty';
        }
      });
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveTarget = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (!validateForm()) {
      openAlert('Validation required', 'Please fix the highlighted fields before saving.');
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const basePayload = {
        ...form,
        employee_id: form.employee_id || null,
        branch_id: form.branch_id || null,
        route_id: form.territory_ids[0] || null,
        territory_ids: form.territory_ids.map(Number),
        target_amount: Number(form.target_amount || 0),
        is_active: true,
      };

      if (form.target_type === 'product' && !form.all_products) {
        const responses = await Promise.all(form.product_ids.map((productId) => axios.post('/api/sales-targets', {
          ...basePayload,
          all_products: false,
          inventory_item_id: Number(productId),
          product_ids: [Number(productId)],
          target_quantity: Number(productQuantities[productId] || 0),
        }, { headers })));

        const createdTargets = responses.map((response) => response.data?.data).filter(Boolean);
        setTargets((current) => [...createdTargets, ...current]);
        openAlert('Targets created', `Sales targets assigned for ${createdTargets.length} product(s).`);
      } else {
        const payload = {
          ...basePayload,
          all_products: form.target_type === 'product' ? form.all_products : false,
          inventory_item_id: form.target_type === 'product' && !form.all_products && form.product_ids.length === 1 ? Number(form.product_ids[0]) : null,
          product_ids: form.target_type === 'product' && !form.all_products ? form.product_ids.map(Number) : [],
          target_quantity: form.target_type === 'product' && form.all_products ? 0 : Number(form.target_quantity || 0),
        };
        const response = await axios.post('/api/sales-targets', payload, { headers });
        setTargets((current) => [response.data?.data, ...current]);
        openAlert('Target created', 'Sales target assigned successfully.');
      }

      setForm((current) => ({ ...current, target_amount: '', target_quantity: '', notes: '', product_ids: [], territory_ids: [] }));
      setProductQuantities({});
    } catch (error: unknown) {
      const responseMessage = isAxiosError(error) ? error.response?.data?.message : null;
      openAlert('Save failed', responseMessage || 'Unable to save target.');
    } finally { setSaving(false); }
  };

  const deleteTarget = async (id: number) => {
    if (!token) return;
    openConfirm({
      title: 'Delete sales target?',
      message: 'This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Keep',
      destructive: true,
      action: async () => {
        try {
          await axios.delete(`/api/sales-targets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          setTargets((current) => current.filter((target) => target.id !== id));
          openAlert('Deleted', 'Sales target deleted successfully.');
        } catch {
          openAlert('Delete failed', 'Unable to delete this sales target.');
        }
      },
    });
  };

  if (!token) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-slate-950 via-emerald-900 to-teal-800 p-6 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Performance Management</p><h1 className="mt-1 text-3xl font-bold">Sales Targets ⭐</h1><p className="mt-1 text-sm text-emerald-100">Assign measurable goals to people, branches, products, and territories.</p></div>
        <button onClick={() => router.push('/dashboard/hrm')} className="rounded-lg border border-white/30 px-4 py-2 text-sm hover:bg-white/10">Back to HRM</button>
      </div>
      <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map((item) => <button key={item.key} onClick={() => setTab(item.key)} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${tab === item.key ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-emerald-50'}`}>{item.label}</button>)}
      </div>

      {tab === 'setup' && <form onSubmit={saveTarget} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4"><h2 className="text-lg font-bold text-slate-900">Assign New Target</h2><p className="text-sm text-slate-500">Set the scope, pick what the target applies to, and define the time window.</p></div><div className="space-y-5">
        <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">1. Scope and Ownership</h3><div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Target scope<select value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value as TargetType })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900"><option value="employee">Employee</option><option value="branch">Branch</option><option value="product">Product</option><option value="territory">Territory</option></select></label>
          <label className="text-sm font-medium text-slate-700">Employee<select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} className={`mt-1 w-full rounded-lg border bg-white p-2 text-slate-900 ${errors.employee_id ? 'border-rose-400' : 'border-slate-300'}`}><option value="">Select employee</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.employee_code} - {e.first_name} {e.last_name}</option>)}</select>{errors.employee_id && <p className="mt-1 text-xs text-rose-600">{errors.employee_id}</p>}</label>
          <label className="text-sm font-medium text-slate-700">Branch<select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className={`mt-1 w-full rounded-lg border bg-white p-2 text-slate-900 ${errors.branch_id ? 'border-rose-400' : 'border-slate-300'}`}><option value="">Select branch</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>{errors.branch_id && <p className="mt-1 text-xs text-rose-600">{errors.branch_id}</p>}</label>
        </div></div>

        <div className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">2. Product and Territory Scope</h3><p className="text-xs text-slate-500">Search and tick the exact items you want to include.</p></div><div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={`rounded-lg border p-3 ${form.target_type === 'product' ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">Products</p><span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{form.all_products ? 'All selected' : `${form.product_ids.length} selected`}</span></div>
            <label className="mb-2 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={form.all_products} onChange={(e) => { setForm({ ...form, all_products: e.target.checked, product_ids: [], target_quantity: e.target.checked ? '' : form.target_quantity }); setProductQuantities({}); }} /> Apply to all products</label>
            {!form.all_products && <>
              <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search by code or name" className="mb-2 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900" />
              <div className={`max-h-48 overflow-y-auto rounded-lg border bg-white p-2 ${errors.product_ids ? 'border-rose-400' : 'border-slate-300'}`}>{filteredProducts.map((p) => <label key={p.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={form.product_ids.includes(String(p.id))} onChange={() => toggleProductId(String(p.id))} />{p.code} - {p.name}</label>)}{!filteredProducts.length && <p className="py-2 text-center text-xs text-slate-500">No matching products.</p>}</div>
              {errors.product_ids && <p className="mt-1 text-xs text-rose-600">{errors.product_ids}</p>}
              {form.product_ids.length > 0 && <div className="mt-3 rounded-lg border border-slate-300 bg-white p-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Per-product target quantity</p><div className="space-y-2">{form.product_ids.map((id) => { const product = products.find((item) => String(item.id) === id); return <div key={id} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px]"><p className="truncate text-sm text-slate-700">{product ? `${product.code} - ${product.name}` : `Product #${id}`}</p><div><input type="number" min="0" step="0.01" value={productQuantities[id] || ''} onChange={(e) => setProductQuantities((current) => ({ ...current, [id]: e.target.value }))} placeholder="Qty" className={`w-full rounded-lg border p-2 text-sm text-slate-900 ${errors[`product_qty_${id}`] ? 'border-rose-400' : 'border-slate-300'}`} />{errors[`product_qty_${id}`] && <p className="mt-1 text-xs text-rose-600">{errors[`product_qty_${id}`]}</p>}</div></div>; })}</div></div>}
            </>}
          </div>

          <div className={`rounded-lg border p-3 ${form.target_type === 'territory' ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/50'}`}>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-slate-800">Territories</p><span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{form.territory_ids.length} selected</span></div>
            <input value={territorySearch} onChange={(e) => setTerritorySearch(e.target.value)} placeholder="Search territory name or route" className="mb-2 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900" />
            <div className={`max-h-48 overflow-y-auto rounded-lg border bg-white p-2 ${errors.territory_ids ? 'border-rose-400' : 'border-slate-300'}`}>{filteredTerritories.map((r) => <label key={r.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={form.territory_ids.includes(String(r.id))} onChange={() => toggleTerritoryId(String(r.id))} />{r.name || `${r.origin} to ${r.destination}`}</label>)}{!filteredTerritories.length && <p className="py-2 text-center text-xs text-slate-500">No matching territories.</p>}</div>
            {errors.territory_ids && <p className="mt-1 text-xs text-rose-600">{errors.territory_ids}</p>}
          </div>
        </div></div>

        <div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">3. Period and Targets</h3><div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Period key<input value={form.period_key} onChange={(e) => setForm({ ...form, period_key: e.target.value })} placeholder="2026-09" className={`mt-1 w-full rounded-lg border p-2 text-slate-900 ${errors.period_key ? 'border-rose-400' : 'border-slate-300'}`} required />{errors.period_key && <p className="mt-1 text-xs text-rose-600">{errors.period_key}</p>}</label>
          <label className="text-sm font-medium text-slate-700">Start date<input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className={`mt-1 w-full rounded-lg border p-2 text-slate-900 ${errors.period_start ? 'border-rose-400' : 'border-slate-300'}`} required />{errors.period_start && <p className="mt-1 text-xs text-rose-600">{errors.period_start}</p>}</label>
          <label className="text-sm font-medium text-slate-700">End date<input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className={`mt-1 w-full rounded-lg border p-2 text-slate-900 ${errors.period_end ? 'border-rose-400' : 'border-slate-300'}`} required />{errors.period_end && <p className="mt-1 text-xs text-rose-600">{errors.period_end}</p>}</label>
          <label className="text-sm font-medium text-slate-700">Target amount<input type="number" min="0" step="0.01" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} className={`mt-1 w-full rounded-lg border p-2 text-slate-900 ${errors.target_amount ? 'border-rose-400' : 'border-slate-300'}`} />{errors.target_amount && <p className="mt-1 text-xs text-rose-600">{errors.target_amount}</p>}</label>
          {!form.all_products && <label className="text-sm font-medium text-slate-700">Target quantity<input type="number" min="0" step="0.01" value={form.target_quantity} onChange={(e) => setForm({ ...form, target_quantity: e.target.value })} className={`mt-1 w-full rounded-lg border p-2 text-slate-900 ${errors.target_quantity ? 'border-rose-400' : 'border-slate-300'}`} />{errors.target_quantity && <p className="mt-1 text-xs text-rose-600">{errors.target_quantity}</p>}</label>}
          <label className="text-sm font-medium text-slate-700 md:col-span-3">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-slate-900" rows={2} placeholder="Optional context for the assignee" /></label>
        </div></div>
      </div><div className="mt-4 flex justify-end"><button disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Assign Target'}</button></div></form>}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-bold text-slate-900">{tab === 'performance' ? 'Target Performance' : tab === 'setup' ? 'Current Assignments' : tabs.find((item) => item.key === tab)?.label}</h2></div>{loading ? <div className="p-8 text-center text-slate-500">Loading targets...</div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Period</th><th className="px-4 py-3 text-right">Target Amount</th><th className="px-4 py-3 text-right">Achieved</th><th className="px-4 py-3 text-right">Progress</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y">{visibleTargets.map((target) => { const progress = Number(target.target_amount) > 0 ? Math.min(100, Number(target.achieved_amount || 0) / Number(target.target_amount) * 100) : 0; return <tr key={target.id}><td className="px-4 py-3 font-medium text-slate-900">{labelFor(target)}<div className="text-xs text-slate-500">{target.target_type}</div></td><td className="px-4 py-3 text-slate-600">{target.period_key}<div className="text-xs">{formatDateValue(target.period_start)} to {formatDateValue(target.period_end)}</div></td><td className="px-4 py-3 text-right text-slate-900">{formatAmount(target.target_amount)}</td><td className="px-4 py-3 text-right text-slate-900">{formatAmount(target.achieved_amount)}</td><td className="px-4 py-3 text-right"><span className="font-semibold text-emerald-700">{progress.toFixed(0)}%</span></td><td className="px-4 py-3"><button onClick={() => deleteTarget(target.id)} className="text-rose-600 hover:underline">Delete</button></td></tr>; })}</tbody></table>{!visibleTargets.length && <p className="p-8 text-center text-slate-500">No targets assigned yet.</p>}</div>}</section>

      {alertModal.open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-md rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{alertModal.title}</h3></div><div className="px-5 py-4"><p className="text-sm text-slate-700">{alertModal.message}</p></div><div className="flex justify-end px-5 py-4"><button onClick={() => setAlertModal({ open: false, title: '', message: '' })} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">OK</button></div></div></div>}

      {confirmModal.open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-md rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{confirmModal.title}</h3></div><div className="px-5 py-4"><p className="text-sm text-slate-700">{confirmModal.message}</p></div><div className="flex justify-end gap-2 px-5 py-4"><button onClick={() => { if (!confirmLoading) { setConfirmModal((current) => ({ ...current, open: false })); setConfirmAction(null); } }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={confirmLoading}>{confirmModal.cancelText}</button><button onClick={runConfirmAction} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${confirmModal.destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`} disabled={confirmLoading}>{confirmLoading ? 'Processing...' : confirmModal.confirmText}</button></div></div></div>}
    </div>
  );
}
