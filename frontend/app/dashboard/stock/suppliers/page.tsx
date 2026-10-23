'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  company: string;
  status: 'active' | 'inactive';
  outstanding_balance: number;
  created_at: string;
  updated_at: string;
}

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

const stockSuppliersWidgetItems = [
  { id: 'stock-suppliers-hero-card', name: 'Stock Suppliers Hero Card' },
  { id: 'stock-suppliers-add-button', name: 'Stock Suppliers Add Button' },
  { id: 'stock-suppliers-table-card', name: 'Stock Suppliers Table Card' },
  { id: 'stock-suppliers-table-headings', name: 'Stock Suppliers Table Headings' },
  { id: 'stock-suppliers-row-action-buttons', name: 'Stock Suppliers Row Action Buttons' },
  { id: 'stock-suppliers-modal-pane', name: 'Stock Suppliers Modal Pane' },
];

export default function Suppliers() {
  const [token, setToken] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    company: '',
    status: 'active' as 'active' | 'inactive',
    outstanding_balance: 0,
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = stockSuppliersWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
    } else {
      setToken(storedToken);
    }
  }, [router]);

  useEffect(() => {
    if (token) {
      fetchSuppliers();
      fetchWidgetVisibility(token);
    }
  }, [token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [suppliers.length]);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/stock/suppliers', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 100 } // Get all suppliers for now
      });

      if (response.data.success) {
        const suppliersData = response.data.data.data || response.data.data || [];
        // Ensure outstanding_balance is a number
        const formattedSuppliers = suppliersData.map((supplier: Record<string, unknown>) => ({
          ...supplier,
          outstanding_balance: Number(supplier.outstanding_balance) || 0
        }));
        setSuppliers(formattedSuppliers);
      } else {
        console.error('Failed to fetch suppliers:', response.data.message);
        setSuppliers([]);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      // Keep mock data as fallback for development
      const mockSuppliers: Supplier[] = [
        {
          id: 1,
          name: 'ABC Supplies Ltd',
          contact_person: 'John Smith',
          email: 'john@abc-supplies.com',
          phone: '+1-555-0123',
          address: '123 Business St, City, State 12345',
          company: 'ABC Supplies Ltd',
          status: 'active',
          outstanding_balance: 2500.00,
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 2,
          name: 'Global Traders Inc',
          contact_person: 'Sarah Johnson',
          email: 'sarah@global-traders.com',
          phone: '+1-555-0456',
          address: '456 Commerce Ave, City, State 12346',
          company: 'Global Traders Inc',
          status: 'active',
          outstanding_balance: 1250.50,
          created_at: '2024-01-20T14:30:00Z',
          updated_at: '2024-01-20T14:30:00Z'
        }
      ];
      setSuppliers(mockSuppliers);
    } finally {
      setLoading(false);
    }
  };

  const fetchWidgetVisibility = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setWidgetVisibility(response.data?.data?.widgets || {});
      setWidgetControlsLocked(Boolean(response.data?.data?.widget_controls_locked));
    } catch {
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    }
  };

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
        }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
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
    const hiddenKeys = stockSuppliersWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
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
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => openSuperAdminConfirmation([], 'unlock');

  const unlockWidgetControls = async () => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    const fallbackWidgetKey = stockSuppliersWidgetItems[0]?.id || 'stock-suppliers-hero-card';
    try {
      setSuperAdminConfirmLoading(true);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: fallbackWidgetKey,
        is_visible: isWidgetVisible(fallbackWidgetKey),
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: false,
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetControlsLocked(false);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setSaving(true);
      if (editingSupplier) {
        // Update existing supplier
        const response = await axios.put(`/api/stock/suppliers/${editingSupplier.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          setSuppliers(prev => prev.map(sup =>
            sup.id === editingSupplier.id
              ? { ...response.data.data, outstanding_balance: Number(response.data.data.outstanding_balance) || 0 }
              : sup
          ));
        } else {
          throw new Error(response.data.message || 'Failed to update supplier');
        }
      } else {
        // Create new supplier
        const response = await axios.post('/api/stock/suppliers', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          setSuppliers(prev => [...prev, { ...response.data.data, outstanding_balance: Number(response.data.data.outstanding_balance) || 0 }]);
        } else {
          throw new Error(response.data.message || 'Failed to create supplier');
        }
      }

      setShowModal(false);
      setEditingSupplier(null);
      resetForm();
    } catch (error: unknown) {
      console.error('Error saving supplier:', error);
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      alert(apiError.response?.data?.message || apiError.message || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      company: supplier.company,
      status: supplier.status,
      outstanding_balance: supplier.outstanding_balance,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await axios.delete(`/api/stock/suppliers/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setSuppliers(prev => prev.filter(sup => sup.id !== id));
        setDeleteConfirm(null);
      } else {
        throw new Error(response.data.message || 'Failed to delete supplier');
      }
    } catch (error: unknown) {
      console.error('Error deleting supplier:', error);
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      alert(apiError.response?.data?.message || apiError.message || 'Failed to delete supplier');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      company: '',
      status: 'active',
      outstanding_balance: 0,
    });
  };

  const openAddModal = () => {
    setEditingSupplier(null);
    resetForm();
    setShowModal(true);
  };

  const supplierFieldClass =
    'mt-2 block w-full rounded-2xl border border-orange-200/80 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition duration-200 placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-4 focus:ring-orange-100';

  const totalPages = Math.max(1, Math.ceil(suppliers.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, suppliers.length);
  const paginatedSuppliers = suppliers.slice(startIndex, endIndex);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_25%),linear-gradient(180deg,_#fffaf5_0%,_#fff3e4_100%)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_23%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.12),_transparent_26%),linear-gradient(180deg,_#fffaf5_0%,_#fff7ed_42%,_#fff3e4_100%)] p-4 sm:p-6 lg:p-8">
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

      {/* Header */}
      {isWidgetVisible('stock-suppliers-hero-card') && <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-[0_26px_90px_-45px_rgba(194,65,12,0.5)] backdrop-blur-xl">
        <div className="grid gap-8 px-5 py-6 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:px-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm font-semibold text-orange-700">
              <span className="h-2 w-2 rounded-full bg-orange-500"></span>
              Vendor relationship workspace
            </div>
            <div>
              <h3 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Supplier Management</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Manage supplier profiles, communication channels, and payable snapshots in one polished command center.
              </p>
            </div>
            {isWidgetVisible('stock-suppliers-add-button') && <button
              onClick={openAddModal}
              className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-300/50 transition hover:scale-[1.02] hover:from-orange-600 hover:to-yellow-500"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Supplier
            </button>}
            {!widgetControlsLocked && isWidgetVisible('stock-suppliers-add-button') && <button type="button" onClick={() => stageWidgetVisibilityChange('stock-suppliers-add-button', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-3xl border border-orange-200/70 bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-300/45">
              <p className="text-xs uppercase tracking-[0.24em] text-white/80">Total Suppliers</p>
              <p className="mt-2 text-3xl font-bold">{suppliers.length}</p>
              <p className="mt-2 text-sm text-white/85">Active vendor records in your system</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Active</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{suppliers.filter((s) => s.status === 'active').length}</p>
              <p className="mt-2 text-sm text-slate-500">Ready for procurement operations</p>
            </div>
            <div className="rounded-3xl border border-red-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
              <p className="text-xs uppercase tracking-[0.24em] text-red-500">Inactive</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{suppliers.filter((s) => s.status === 'inactive').length}</p>
              <p className="mt-2 text-sm text-slate-500">Archived or paused vendors</p>
            </div>
          </div>
        </div>
        {!widgetControlsLocked && <div className="px-5 pb-4 sm:px-6 lg:px-8"><button type="button" onClick={() => stageWidgetVisibilityChange('stock-suppliers-hero-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
      </div>}

      {/* Suppliers Table */}
      {isWidgetVisible('stock-suppliers-table-card') && <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
        <div className="border-b border-orange-100 bg-gradient-to-r from-slate-900 via-orange-900 to-amber-800 px-5 py-3.5">
          <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-100">Supplier Directory</h4>
        </div>
        <div className="px-4 py-5 sm:p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
            </div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-slate-500 text-sm">No suppliers found</div>
              <button
                onClick={openAddModal}
                className="mt-4 rounded-full bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-orange-700 hover:to-amber-600"
              >
                Add Your First Supplier
              </button>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                {isWidgetVisible('stock-suppliers-table-headings') && <thead className="bg-slate-100/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Supplier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Outstanding Balance
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Actions
                    </th>
                  </tr>
                </thead>}
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedSuppliers.map((supplier) => (
                    <tr key={supplier.id} className="transition hover:bg-orange-50/35">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                              <span className="text-orange-600 font-medium text-sm">
                                {supplier.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {supplier.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {supplier.company}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{supplier.contact_person}</div>
                        <div className="text-sm text-gray-500">{supplier.email}</div>
                        <div className="text-sm text-gray-500">{supplier.phone}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          supplier.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {supplier.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        LKR {Number(supplier.outstanding_balance).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isWidgetVisible('stock-suppliers-row-action-buttons') && <button
                          onClick={() => handleEdit(supplier)}
                          className="mr-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        >
                          Edit
                        </button>}
                        {isWidgetVisible('stock-suppliers-row-action-buttons') && <button
                          onClick={() => setDeleteConfirm(supplier.id)}
                          className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Delete
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!widgetControlsLocked && <div className="px-5 pb-4 sm:px-6"><button type="button" onClick={() => stageWidgetVisibilityChange('stock-suppliers-table-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-orange-100 bg-orange-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Showing {suppliers.length === 0 ? 0 : startIndex + 1} to {endIndex} of {suppliers.length} suppliers
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Rows</label>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-sm text-slate-700"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm font-semibold text-slate-700">
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    className="rounded-full border border-orange-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      </div>}

      {/* Add/Edit Modal */}
      {isWidgetVisible('stock-suppliers-modal-pane') && showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/55 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-[30px] border border-white/25 bg-white shadow-[0_28px_90px_-35px_rgba(234,88,12,0.55)]">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.3),_transparent_42%),linear-gradient(120deg,_rgba(194,65,12,0.95)_0%,_rgba(234,88,12,0.95)_45%,_rgba(249,115,22,0.92)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pt-7 pb-6 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    {editingSupplier ? '✎' : '🤝'}
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {editingSupplier ? 'Update Supplier Profile' : 'Add New Supplier'}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
                    Build a complete supplier profile with identity, contacts, and financial status in one polished workflow.
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Supplier Profile</p>
                    <h4 className="mt-2 text-lg font-semibold text-gray-900">Identity and relationship</h4>
                    <p className="mt-1 text-sm text-gray-500">Capture supplier information used across purchasing and stock operations.</p>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Supplier Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className={supplierFieldClass}
                          placeholder="Enter supplier name"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Company</label>
                        <input
                          type="text"
                          value={formData.company}
                          onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                          className={supplierFieldClass}
                          placeholder="Enter company name"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Contact Person *</label>
                        <input
                          type="text"
                          required
                          value={formData.contact_person}
                          onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                          className={supplierFieldClass}
                          placeholder="Enter contact person"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Status</label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                          className={supplierFieldClass}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Address</label>
                        <textarea
                          rows={4}
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className={`${supplierFieldClass} min-h-[110px] resize-none`}
                          placeholder="Enter full address"
                        />
                      </div>
                    </div>
                  </section>

                  <div className="space-y-6">
                    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Contact Channels</p>
                      <h4 className="mt-2 text-lg font-semibold text-gray-900">Communication</h4>
                      <p className="mt-1 text-sm text-gray-500">Primary channels for PO follow-up and delivery coordination.</p>

                      <div className="mt-5 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Email</label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className={supplierFieldClass}
                            placeholder="Enter email address"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Phone</label>
                          <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className={supplierFieldClass}
                            placeholder="Enter phone number"
                          />
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Financial Snapshot</p>
                      <h4 className="mt-2 text-lg font-semibold text-gray-900">Opening balance</h4>
                      <p className="mt-1 text-sm text-gray-500">Track outstanding supplier payable at onboarding or update stage.</p>

                      <div className="mt-5">
                        <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Outstanding Balance</label>
                        <div className="relative mt-2">
                          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-orange-600">LKR</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.outstanding_balance}
                            onChange={(e) => setFormData({ ...formData, outstanding_balance: Number(e.target.value) || 0 })}
                            className={`${supplierFieldClass} pl-14`}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-200 transition hover:scale-[1.01] hover:shadow-xl hover:shadow-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : (editingSupplier ? 'Update Supplier' : 'Add Supplier')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/25 bg-white shadow-[0_24px_80px_-35px_rgba(239,68,68,0.6)]">
            <div className="bg-gradient-to-r from-red-600 to-orange-500 px-6 py-5 text-white">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-xl">
                ⚠
              </div>
              <h3 className="mt-3 text-xl font-semibold">Delete Supplier</h3>
              <p className="mt-1 text-sm text-white/90">This action is permanent and cannot be undone.</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600">
                Are you sure you want to delete this supplier record from the directory?
              </p>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="rounded-full border border-transparent bg-gradient-to-r from-red-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-red-700 hover:to-orange-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{stockSuppliersWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
    </div>
  );
}