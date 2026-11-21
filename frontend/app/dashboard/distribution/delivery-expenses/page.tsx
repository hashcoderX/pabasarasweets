'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

type LoadRow = {
  id: number;
  load_number?: string;
  load_date?: string;
  status?: string;
  sales_ref_id?: number | null;
  route_id?: number | null;
  route_candidates?: number[];
  load_routes?: Array<{ route_id?: number | null }>;
};

type ExpenseRow = {
  id: number | string;
  load_id: number;
  expense_date: string;
  expense_type: string;
  amount: number;
  reference?: string | null;
  note?: string | null;
  bill_attachment_name?: string | null;
  bill_attachment_url?: string | null;
};

const expenseTypeOptions = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'foods', label: 'Foods' },
  { value: 'driver_allowance', label: 'Driver Allowance' },
  { value: 'helper_allowance', label: 'Helper Allowance' },
  { value: 'delivery_staff_meal', label: 'Delivery Staff Meal' },
  { value: 'parking', label: 'Parking' },
  { value: 'highway_toll', label: 'Highway Toll' },
  { value: 'loading_unloading', label: 'Loading/Unloading' },
  { value: 'vehicle_wash', label: 'Vehicle Wash' },
  { value: 'phone_recharge', label: 'Phone Recharge' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
] as const;

export default function DistributionDeliveryExpensesPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [isRefScoped, setIsRefScoped] = useState(false);
  const [allocatedRouteIds, setAllocatedRouteIds] = useState<number[]>([]);
  const [allocatedRouteNames, setAllocatedRouteNames] = useState<string[]>([]);
  const [selectedLoadId, setSelectedLoadId] = useState('');
  const [detectedLoadId, setDetectedLoadId] = useState<number | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [billAttachmentFile, setBillAttachmentFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().slice(0, 10),
    expense_type: 'fuel',
    amount: '',
    reference: '',
    note: '',
  });

  const router = useRouter();

  const selectedLoad = useMemo(
    () => loads.find((load) => String(load.id) === selectedLoadId) || null,
    [loads, selectedLoadId]
  );

  const totalExpense = useMemo(
    () => expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [expenses]
  );

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

    const bootstrap = async () => {
      try {
        setLoading(true);
        setErrorMessage('');

        const [userRes, loadsRes] = await Promise.all([
          axios.get('/api/user', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/vehicle-loading/loads', {
            headers: { Authorization: `Bearer ${token}` },
            params: { per_page: 200 },
          }),
        ]);

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

        const roleBlob = roleNames.join(' ');
        const isAdminUser =
          !employeeId ||
          roleBlob.includes('super admin') ||
          roleBlob.includes('superadmin') ||
          roleBlob.includes('administrator') ||
          roleBlob.includes('admin');

        const hasDistributionAccess =
          isAdminUser ||
          roleBlob.includes('sales ref') ||
          roleBlob.includes('sales representative') ||
          roleBlob.includes('sales_ref') ||
          roleBlob.includes('distribution');

        if (!hasDistributionAccess) {
          router.push('/dashboard');
          return;
        }

        const routeIdsFromStorage = Array.from(
          new Set(
            [
              Number(localStorage.getItem('distribution_assigned_route_id') || 0),
              ...String(localStorage.getItem('distribution_assigned_route_ids') || '')
                .split(',')
                .map((value) => Number(value || 0)),
            ].filter((value) => value > 0)
          )
        );
        const routeNamesFromStorage = Array.from(
          new Set(
            [
              String(localStorage.getItem('distribution_assigned_route_name') || '').trim(),
              ...String(localStorage.getItem('distribution_assigned_route_names') || '')
                .split('|')
                .map((value) => value.trim()),
            ].filter(Boolean)
          )
        );

        setAllocatedRouteIds(routeIdsFromStorage);
        setAllocatedRouteNames(routeNamesFromStorage);

        const payload = loadsRes.data;
        const list = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.data?.data)
              ? payload.data.data
              : [];

        const mapped = list.map((row: any) => ({
          route_candidates: Array.from(
            new Set(
              [
                Number(row.route_id || 0),
                Number(row.route?.id || 0),
                ...(Array.isArray(row.load_routes)
                  ? row.load_routes.map((entry: any) => Number(entry?.route_id || entry?.route?.id || 0))
                  : []),
                ...(Array.isArray(row.loadRoutes)
                  ? row.loadRoutes.map((entry: any) => Number(entry?.route_id || entry?.route?.id || 0))
                  : []),
              ].filter((value) => value > 0)
            )
          ),
          id: Number(row.id),
          load_number: String(row.load_number || ''),
          load_date: String(row.load_date || ''),
          status: String(row.status || ''),
          sales_ref_id: row.sales_ref_id ? Number(row.sales_ref_id) : null,
          route_id: row.route_id ? Number(row.route_id) : null,
          load_routes: Array.isArray(row.load_routes)
            ? row.load_routes.map((entry: any) => ({ route_id: entry?.route_id ? Number(entry.route_id) : null }))
            : Array.isArray(row.loadRoutes)
              ? row.loadRoutes.map((entry: any) => ({ route_id: entry?.route_id ? Number(entry.route_id) : null }))
              : [],
        })) as LoadRow[];

        const isSalesRefUser = !isAdminUser && employeeId > 0;
        if (isSalesRefUser && routeIdsFromStorage.length === 0) {
          setIsRefScoped(true);
          setLoads([]);
          setSelectedLoadId('');
          setDetectedLoadId(null);
          setErrorMessage('Security restriction: no allocated route found for this sales ref account.');
          return;
        }
        const hasSalesRefMarkers = mapped.some((load) => Number(load.sales_ref_id || 0) > 0);
        const hasRouteMarkers = mapped.some((load) => (load.route_candidates || []).length > 0);
        const strictFilteredLoads = isSalesRefUser
          ? mapped.filter((load) => {
              const bySalesRef = Number(load.sales_ref_id || 0) === employeeId;
              const routeCandidates = load.route_candidates || [];
              const byAllocatedRoute =
                routeIdsFromStorage.length > 0 && routeCandidates.some((routeId) => routeIdsFromStorage.includes(routeId));
              return bySalesRef || byAllocatedRoute;
            })
          : mapped;

        const filteredLoads =
          isSalesRefUser && strictFilteredLoads.length === 0 && !hasSalesRefMarkers && !hasRouteMarkers
            ? mapped
            : strictFilteredLoads;

        const sortedByPriority = [...filteredLoads].sort((first, second) => {
          const statusRank = (status?: string) => {
            const value = String(status || '').toLowerCase();
            if (value === 'in_transit') return 0;
            if (value === 'pending') return 1;
            if (value === 'delivered') return 2;
            return 3;
          };

          const rankDiff = statusRank(first.status) - statusRank(second.status);
          if (rankDiff !== 0) return rankDiff;

          const firstDate = new Date(first.load_date || 0).getTime();
          const secondDate = new Date(second.load_date || 0).getTime();
          return secondDate - firstDate;
        });

        setIsRefScoped(isSalesRefUser);
        setLoads(sortedByPriority);
        if (sortedByPriority.length > 0) {
          const selectedId = Number(sortedByPriority[0].id);
          setSelectedLoadId(String(selectedId));
          setDetectedLoadId(selectedId);
        } else {
          const cachedLoadId = Number(localStorage.getItem('distribution_active_load_id') || 0);
          if (cachedLoadId > 0) {
            setDetectedLoadId(cachedLoadId);
          } else {
            setDetectedLoadId(null);
          }
          setSelectedLoadId('');
        }
      } catch (error) {
        console.error('Error loading delivery expenses page:', error);
        setErrorMessage('Failed to load delivery expense setup.');
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();
  }, [token, router]);

  useEffect(() => {
    if (!token || !selectedLoadId) {
      setExpenses([]);
      return;
    }

    const fetchExpenses = async () => {
      try {
        setExpenseLoading(true);
        setErrorMessage('');
        const res = await axios.get(`/api/vehicle-loading/loads/${selectedLoadId}/expenses`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const rows = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];

        setExpenses(
          rows.map((row: any) => ({
            id: typeof row.id === 'number' || typeof row.id === 'string' ? row.id : 0,
            load_id: Number(row.load_id || selectedLoadId),
            expense_date: String(row.expense_date || ''),
            expense_type: String(row.expense_type || 'other'),
            amount: Number(row.amount || 0),
            reference: row.reference ? String(row.reference) : null,
            note: row.note ? String(row.note) : null,
            bill_attachment_name: row.bill_attachment_name ? String(row.bill_attachment_name) : null,
            bill_attachment_url: row.bill_attachment_url ? String(row.bill_attachment_url) : null,
          }))
        );
      } catch (error) {
        console.error('Error loading load expenses:', error);
        setErrorMessage('Failed to load expense records for selected load.');
      } finally {
        setExpenseLoading(false);
      }
    };

    void fetchExpenses();
  }, [token, selectedLoadId]);

  const handleSaveExpense = async () => {
    if (!selectedLoadId) {
      setErrorMessage('Please select a load first.');
      return;
    }

    const amount = Number(form.amount || 0);
    if (!form.expense_date || Number.isNaN(amount) || amount <= 0) {
      setErrorMessage('Enter a valid expense date and amount.');
      setSuccessMessage('');
      return;
    }

    try {
      setSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      const payload = new FormData();
      payload.append('expense_date', form.expense_date);
      payload.append('expense_type', form.expense_type);
      payload.append('amount', String(amount));
      if (form.reference.trim()) payload.append('reference', form.reference.trim());
      if (form.note.trim()) payload.append('note', form.note.trim());
      if (billAttachmentFile) payload.append('bill_attachment', billAttachmentFile);

      await axios.post(
        `/api/vehicle-loading/loads/${selectedLoadId}/expenses`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccessMessage('Delivery expense recorded successfully.');
      setForm((prev) => ({
        ...prev,
        amount: '',
        reference: '',
        note: '',
      }));
      setBillAttachmentFile(null);

      const refreshed = await axios.get(`/api/vehicle-loading/loads/${selectedLoadId}/expenses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rows = Array.isArray(refreshed.data)
        ? refreshed.data
        : Array.isArray(refreshed.data?.data)
          ? refreshed.data.data
          : [];
      setExpenses(
        rows.map((row: any) => ({
          id: typeof row.id === 'number' || typeof row.id === 'string' ? row.id : 0,
          load_id: Number(row.load_id || selectedLoadId),
          expense_date: String(row.expense_date || ''),
          expense_type: String(row.expense_type || 'other'),
          amount: Number(row.amount || 0),
          reference: row.reference ? String(row.reference) : null,
          note: row.note ? String(row.note) : null,
          bill_attachment_name: row.bill_attachment_name ? String(row.bill_attachment_name) : null,
          bill_attachment_url: row.bill_attachment_url ? String(row.bill_attachment_url) : null,
        }))
      );
    } catch (error: any) {
      console.error('Error saving delivery expense:', error);
      setErrorMessage(String(error?.response?.data?.message || 'Failed to record delivery expense.'));
      setSuccessMessage('');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50 flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-green-600" />
      </div>
    );
  }

  const isSalesRefWithoutAllocatedRoute = isRefScoped && allocatedRouteIds.length === 0;

  if (isSalesRefWithoutAllocatedRoute) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50">
        <nav className="bg-white/80 backdrop-blur-md shadow-sm border-b border-white/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Distribution Delivery Expenses</h1>
              <p className="text-xs text-slate-500">Dedicated section to add delivery expenses.</p>
            </div>
            <Link
              href="/dashboard/distribution"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to Distribution
            </Link>
          </div>
        </nav>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <h2 className="text-base font-semibold">Delivery Expenses Hidden For Security</h2>
            <p className="mt-1">
              No allocated route was found for this sales ref account, so delivery expense access is blocked.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50">
      <nav className="bg-white/80 backdrop-blur-md shadow-sm border-b border-white/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Distribution Delivery Expenses</h1>
            <p className="text-xs text-slate-500">Dedicated section to add delivery expenses.</p>
          </div>
          <Link
            href="/dashboard/distribution"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to Distribution
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {errorMessage && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl p-5">
          {isRefScoped && (
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                <p className="text-xs uppercase text-cyan-700">Allocated Route IDs</p>
                <p className="mt-1 text-sm font-semibold text-cyan-900">
                  {allocatedRouteIds.length > 0 ? allocatedRouteIds.join(', ') : 'Not resolved'}
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-xs uppercase text-emerald-700">Allocated Routes</p>
                <p className="mt-1 text-sm font-semibold text-emerald-900">
                  {allocatedRouteNames.length > 0 ? allocatedRouteNames.join(' | ') : 'Route name not available'}
                </p>
              </div>
            </div>
          )}
          {isRefScoped && (
            <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Loads are auto-detected from your allocated Sales Ref route/load assignment.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
              <p className="text-xs uppercase text-slate-500">Selected Load</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {selectedLoad ? (selectedLoad.load_number || `Load #${selectedLoad.id}`) : '-'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Detected Load ID: <span className="font-semibold text-slate-800">{detectedLoadId ?? '-'}</span>
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl p-5">
          <h2 className="text-base font-semibold text-slate-900 mb-3">Add Expense</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={form.expense_date}
                onChange={(e) => setForm((prev) => ({ ...prev, expense_date: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={form.expense_type}
                onChange={(e) => setForm((prev) => ({ ...prev, expense_type: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {expenseTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reference (optional)</label>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="Voucher / Bill no"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Note (optional)</label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Expense details"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Attach Bill (optional)</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setBillAttachmentFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-100 file:px-3 file:py-1 file:text-emerald-800"
              />
              <p className="mt-1 text-xs text-slate-500">Accepted: JPG, PNG, WEBP, PDF (max 5MB)</p>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleSaveExpense}
              disabled={saving || !selectedLoadId}
              className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Add Delivery Expense'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Expense Records</h2>
            <span className="text-sm text-slate-700">Total: {totalExpense.toFixed(2)}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-600">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-600">Category</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-600">Reference</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-600">Bill</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-600">Note</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {expenseLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Loading expenses...</td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No expenses recorded for selected load.</td>
                  </tr>
                ) : (
                  expenses.map((row) => (
                    <tr key={String(row.id)}>
                      <td className="px-4 py-2 text-sm text-slate-700">{row.expense_date || '-'}</td>
                      <td className="px-4 py-2 text-sm text-slate-700">{row.expense_type || '-'}</td>
                      <td className="px-4 py-2 text-sm text-slate-700">{row.reference || '-'}</td>
                      <td className="px-4 py-2 text-sm text-slate-700">
                        {row.bill_attachment_url ? (
                          <a
                            href={row.bill_attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                          >
                            {row.bill_attachment_name || 'View Bill'}
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-700">{row.note || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-slate-900">{Number(row.amount || 0).toFixed(2)}</td>
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
