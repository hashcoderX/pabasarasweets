'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Outlet {
  id: number;
  name: string;
  code: string;
  manager_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: 'active' | 'inactive';
  user?: {
    id: number;
    name: string;
    email: string;
  } | null;
  created_at: string;
  updated_at: string;
}

interface OutletStockLine {
  inventory_item_id: number;
  name: string;
  code: string;
  unit: string;
  available_quantity: number;
}

interface OutletSalesItemWise {
  inventory_item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  total_qty: number;
  total_amount: number;
}

interface OutletSaleRecord {
  id: number;
  sale_number: string;
  sale_date: string;
  customer_name: string | null;
  total_quantity: number;
  total_amount: number;
}

export default function OutletManagementPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(null);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockLines, setStockLines] = useState<OutletStockLine[]>([]);
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesTotals, setSalesTotals] = useState({ total_sales: 0, total_quantity: 0, total_amount: 0 });
  const [salesRecords, setSalesRecords] = useState<OutletSaleRecord[]>([]);
  const [itemWiseSales, setItemWiseSales] = useState<OutletSalesItemWise[]>([]);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('Notice');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Outlet | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [origin, setOrigin] = useState('');
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    manager_name: '',
    email: '',
    phone: '',
    address: '',
    status: 'active' as 'active' | 'inactive',
    outlet_user_name: '',
    outlet_user_email: '',
    outlet_user_password: '',
  });

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
      fetchOutlets();
    }
  }, [token]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const fetchOutlets = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/outlets', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 100 }
      });

      const data = response.data.success ? (response.data.data.data || response.data.data || []) : [];
      setOutlets(data);
    } catch (error) {
      console.error('Error fetching outlets:', error);
      setOutlets([]);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      manager_name: '',
      email: '',
      phone: '',
      address: '',
      status: 'active',
      outlet_user_name: '',
      outlet_user_email: '',
      outlet_user_password: '',
    });
    setEditingOutlet(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const showNotice = (title: string, message: string) => {
    setNoticeTitle(title);
    setNoticeMessage(message);
    setNoticeOpen(true);
  };

  const openEdit = (outlet: Outlet) => {
    setEditingOutlet(outlet);
    setFormData({
      name: outlet.name,
      code: outlet.code,
      manager_name: outlet.manager_name || '',
      email: outlet.email || '',
      phone: outlet.phone || '',
      address: outlet.address || '',
      status: outlet.status,
      outlet_user_name: outlet.user?.name || '',
      outlet_user_email: outlet.user?.email || '',
      outlet_user_password: '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingOutlet) {
        const updatePayload = {
          name: formData.name,
          code: formData.code,
          manager_name: formData.manager_name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          status: formData.status,
        };
        await axios.put(`/api/outlets/${editingOutlet.id}`, updatePayload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        const createRes = await axios.post('/api/outlets', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const createdOutlet = createRes?.data?.data;
        const posLink = `${window.location.origin}/outlet-pos?outlet_code=${encodeURIComponent(createdOutlet?.code || formData.code)}`;
        showNotice(
          'Outlet Created Successfully',
          `POS Link: ${posLink}\nOutlet POS Login Email: ${formData.outlet_user_email}`
        );
      }

      setShowModal(false);
      resetForm();
      fetchOutlets();
    } catch (error: any) {
      console.error('Error saving outlet:', error);
      showNotice('Save Failed', error?.response?.data?.message || 'Failed to save outlet');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (outlet: Outlet) => {
    setDeleteTarget(outlet);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      setDeleting(true);
      await axios.delete(`/api/outlets/${deleteTarget.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      fetchOutlets();
    } catch (error: any) {
      console.error('Error deleting outlet:', error);
      showNotice('Delete Failed', error?.response?.data?.message || 'Failed to delete outlet');
    } finally {
      setDeleting(false);
    }
  };

  const openStoreReport = async (outlet: Outlet) => {
    try {
      setSelectedOutlet(outlet);
      setStockModalOpen(true);
      setStockLoading(true);

      const response = await axios.get(`/api/outlets/${outlet.id}/stock-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const lines = response.data?.success ? (response.data?.data?.stocks || []) : [];
      setStockLines(lines);
    } catch (error) {
      console.error('Error fetching outlet store report:', error);
      setStockLines([]);
    } finally {
      setStockLoading(false);
    }
  };

  const openSalesRecords = async (outlet: Outlet) => {
    try {
      setSelectedOutlet(outlet);
      setSalesModalOpen(true);
      setSalesLoading(true);

      const response = await axios.get(`/api/outlet-pos/outlets/${outlet.id}/sales-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = response.data?.data || {};
      setSalesTotals(data?.totals || { total_sales: 0, total_quantity: 0, total_amount: 0 });
      setSalesRecords(data?.sales || []);
      setItemWiseSales(data?.item_wise || []);
    } catch (error) {
      console.error('Error fetching outlet sales records:', error);
      setSalesTotals({ total_sales: 0, total_quantity: 0, total_amount: 0 });
      setSalesRecords([]);
      setItemWiseSales([]);
    } finally {
      setSalesLoading(false);
    }
  };

  const activeOutlets = outlets.filter((outlet) => outlet.status === 'active').length;
  const inactiveOutlets = outlets.length - activeOutlets;
  const outletsWithUsers = outlets.filter((outlet) => outlet.user?.email).length;
  const fieldClass =
    'w-full rounded-2xl border border-violet-200/70 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition duration-200 placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-200/70';

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.14),_transparent_24%),linear-gradient(180deg,_#f8f7ff_0%,_#f5f7fb_42%,_#eef2ff_100%)]">
      <nav className="border-b border-white/50 bg-white/70 shadow-sm backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-500 text-lg text-white shadow-lg shadow-violet-300/50">
                🏪
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">Outlets Management</h1>
                <p className="text-xs text-slate-500">Create stores, assign POS access and manage outlet operations</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 overflow-hidden rounded-[32px] border border-white/60 bg-white/70 shadow-[0_24px_80px_-40px_rgba(76,29,149,0.45)] backdrop-blur-xl">
          <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.4fr_0.9fr] lg:px-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-700">
                <span className="h-2 w-2 rounded-full bg-violet-500"></span>
                Retail control center
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Outlets Management</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  Organize outlet locations, assign store operators, and keep POS access polished and ready for day-to-day retail operations.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => router.back()}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                >
                  Back
                </button>
                <button
                  onClick={() => router.push('/dashboard/outlets')}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                >
                  Outlets Home
                </button>
                <button
                  onClick={() => router.push('/dashboard/outlets/sales')}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
                >
                  Outlet Sales Tracking
                </button>
                <button
                  onClick={openCreate}
                  className="rounded-full bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-300/50 transition hover:scale-[1.02] hover:shadow-xl hover:shadow-violet-300/60"
                >
                  Add Outlet
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-500 to-purple-600 p-5 text-white shadow-lg shadow-violet-300/40">
                <p className="text-xs uppercase tracking-[0.24em] text-white/70">Total Outlets</p>
                <p className="mt-3 text-3xl font-bold">{outlets.length}</p>
                <p className="mt-2 text-sm text-white/80">All registered retail locations</p>
              </div>
              <div className="rounded-3xl border border-emerald-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Active Stores</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{activeOutlets}</p>
                <p className="mt-2 text-sm text-slate-500">{inactiveOutlets} inactive outlets currently paused</p>
              </div>
              <div className="rounded-3xl border border-sky-200/80 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.24em] text-sky-600">POS Ready</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{outletsWithUsers}</p>
                <p className="mt-2 text-sm text-slate-500">Outlets with linked operator accounts</p>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-white/70 bg-white/75 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.4)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 border-b border-slate-200/80 bg-gradient-to-r from-slate-900 via-violet-900 to-indigo-900 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Outlet Directory</h2>
              <p className="mt-1 text-sm text-white/70">Review outlet identities, POS access and operation status in one place.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
              {activeOutlets} active of {outlets.length} outlets
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-slate-50/90">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manager</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">POS Access</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {outlets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">
                      No outlets found.
                    </td>
                  </tr>
                ) : (
                  outlets.map((outlet) => (
                    <tr key={outlet.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{outlet.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{outlet.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{outlet.manager_name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{outlet.user?.email || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => window.open(`/outlet-pos?outlet_code=${encodeURIComponent(outlet.code)}`, '_blank')}
                            className="px-2 py-1 text-xs rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          >
                            Open POS
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const posLink = `${origin}/outlet-pos?outlet_code=${encodeURIComponent(outlet.code)}`;
                              try {
                                await navigator.clipboard.writeText(posLink);
                                showNotice('POS Link Copied', `POS link copied for ${outlet.name}`);
                              } catch {
                                showNotice('Copy Failed', `Please copy this POS link manually:\n${posLink}`);
                              }
                            }}
                            className="px-2 py-1 text-xs rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200"
                          >
                            Copy Link
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{outlet.phone || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          outlet.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {outlet.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => router.push(`/dashboard/outlets/account/${outlet.id}`)}
                            className="text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-3 py-1 rounded-md text-sm font-medium"
                          >
                            Outlet Account
                          </button>
                          <button
                            onClick={() => router.push(`/dashboard/outlets/store/${outlet.id}`)}
                            className="text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-3 py-1 rounded-md text-sm font-medium"
                          >
                            View Store
                          </button>
                          <button
                            onClick={() => router.push(`/dashboard/outlets/sales/${outlet.id}`)}
                            className="text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-md text-sm font-medium"
                          >
                            Sales Records
                          </button>
                          <button
                            onClick={() => openEdit(outlet)}
                            className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md text-sm font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(outlet)}
                            className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md text-sm font-medium"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/20 bg-white shadow-[0_30px_120px_-35px_rgba(67,56,202,0.55)]">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.32),_transparent_48%),linear-gradient(135deg,_rgba(76,29,149,1)_0%,_rgba(109,40,217,0.94)_45%,_rgba(79,70,229,0.9)_100%)]"></div>
            <div className="relative flex max-h-[90vh] flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-8">
                <div className="max-w-2xl text-white">
                  <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-2xl shadow-lg shadow-violet-950/20 backdrop-blur-md">
                    {editingOutlet ? '✦' : '🏪'}
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {editingOutlet ? 'Refine Outlet Profile' : 'Create Outlet Experience'}
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
                    {editingOutlet
                      ? 'Update store identity, contact points and activation settings with a cleaner control surface.'
                      : 'Set up a polished outlet profile, operator access and POS-ready credentials from one premium workspace.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-xl text-white transition hover:bg-white/20"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSave} className="relative overflow-y-auto px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-6">
                    <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-violet-500">Outlet Profile</p>
                          <h4 className="mt-2 text-lg font-semibold text-slate-900">Store identity</h4>
                          <p className="mt-1 text-sm text-slate-500">Define how this outlet appears across reporting, operations and retail workflows.</p>
                        </div>
                        <div className="rounded-2xl bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700">Core details</div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Outlet Name</label>
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className={fieldClass}
                            placeholder="Downtown Retail Hub"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Outlet Code</label>
                          <input
                            type="text"
                            value={formData.code}
                            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                            className={fieldClass}
                            placeholder="OUT001"
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Manager Name</label>
                          <input
                            type="text"
                            value={formData.manager_name}
                            onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })}
                            className={fieldClass}
                            placeholder="Store manager name"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Status</label>
                          <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                            className={fieldClass}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-sky-500">Operations Contact</p>
                        <h4 className="mt-2 text-lg font-semibold text-slate-900">Communication details</h4>
                        <p className="mt-1 text-sm text-slate-500">Keep each outlet reachable for support, sales coordination and operational follow-up.</p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Phone</label>
                          <input
                            type="text"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className={fieldClass}
                            placeholder="077 123 4567"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Email</label>
                          <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className={fieldClass}
                            placeholder="outlet@company.com"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Address</label>
                          <textarea
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            className={`${fieldClass} min-h-[112px] resize-none`}
                            placeholder="Street, city, landmark, and other delivery or branch details"
                            rows={4}
                          />
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="space-y-6">
                    <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-sm">
                      <div className="border-b border-violet-100 bg-gradient-to-br from-violet-50 via-white to-indigo-50 px-5 py-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-violet-500">POS Access</p>
                        <h4 className="mt-2 text-lg font-semibold text-slate-900">Outlet operator credentials</h4>
                        <p className="mt-1 text-sm text-slate-500">
                          {editingOutlet
                            ? 'Current linked user details are shown here for reference.'
                            : 'Create a dedicated outlet login for POS usage right from this modal.'}
                        </p>
                      </div>

                      <div className="space-y-4 p-5">
                        {!editingOutlet ? (
                          <>
                            <div>
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Outlet User Name</label>
                              <input
                                type="text"
                                value={formData.outlet_user_name}
                                onChange={(e) => setFormData({ ...formData, outlet_user_name: e.target.value })}
                                className={fieldClass}
                                placeholder="Outlet operator name"
                                required
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Outlet User Email</label>
                              <input
                                type="email"
                                value={formData.outlet_user_email}
                                onChange={(e) => setFormData({ ...formData, outlet_user_email: e.target.value })}
                                className={fieldClass}
                                placeholder="pos.user@company.com"
                                required
                              />
                            </div>
                            <div>
                              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Outlet User Password</label>
                              <input
                                type="password"
                                value={formData.outlet_user_password}
                                onChange={(e) => setFormData({ ...formData, outlet_user_password: e.target.value })}
                                className={fieldClass}
                                minLength={8}
                                placeholder="Minimum 8 characters"
                                required
                              />
                              <p className="mt-2 text-xs text-slate-500">Use a strong password for secure POS access and cashier sessions.</p>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-3xl border border-dashed border-violet-200 bg-violet-50/60 p-4 text-sm text-slate-600">
                            <p className="font-medium text-slate-900">Outlet user account</p>
                            <p className="mt-2">Name: <span className="font-medium text-slate-800">{formData.outlet_user_name || 'Not linked'}</span></p>
                            <p className="mt-1">Email: <span className="font-medium text-slate-800">{formData.outlet_user_email || 'Not linked'}</span></p>
                            <p className="mt-3 text-xs text-slate-500">User credential creation is available during new outlet onboarding.</p>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-lg shadow-slate-900/10">
                      <p className="text-xs font-semibold uppercase tracking-[0.26em] text-violet-300">Launch Notes</p>
                      <h4 className="mt-2 text-lg font-semibold">Ready for store activation</h4>
                      <ul className="mt-4 space-y-3 text-sm text-white/75">
                        <li>Each outlet code can be used to open the dedicated POS session URL.</li>
                        <li>Keep contact and manager details complete for smoother support coordination.</li>
                        <li>Use active status only when the store is prepared for transactions.</li>
                      </ul>
                    </section>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-300/50 transition hover:scale-[1.01] hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : editingOutlet ? 'Update Outlet' : 'Create Outlet'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {noticeOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/20 bg-white shadow-[0_28px_90px_-40px_rgba(67,56,202,0.55)]">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-4 text-white">
              <h3 className="text-lg font-semibold">{noticeTitle}</h3>
            </div>
            <div className="px-6 py-5">
              <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{noticeMessage}</p>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setNoticeOpen(false)}
                  className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-white shadow-[0_28px_90px_-40px_rgba(239,68,68,0.5)]">
            <div className="bg-gradient-to-r from-red-600 to-orange-500 px-6 py-4 text-white">
              <h3 className="text-lg font-semibold">Delete Outlet</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm leading-6 text-slate-600">
                Are you sure you want to delete outlet <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>? This action cannot be undone.
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setDeleteTarget(null);
                  }}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="rounded-full border border-transparent bg-gradient-to-r from-red-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-red-700 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {stockModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Outlet Store - {selectedOutlet?.name}
              </h3>
              <button
                onClick={() => {
                  setStockModalOpen(false);
                  setStockLines([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {stockLoading ? (
              <div className="py-8 text-center text-gray-500">Loading outlet store...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Available Qty</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stockLines.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No stock in this outlet store.</td>
                      </tr>
                    ) : (
                      stockLines.map((line) => (
                        <tr key={line.inventory_item_id}>
                          <td className="px-4 py-2 text-sm text-gray-800">{line.name}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">{line.code}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">{line.unit}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(line.available_quantity || 0).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {salesModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Sales Records - {selectedOutlet?.name}
              </h3>
              <button
                onClick={() => {
                  setSalesModalOpen(false);
                  setSalesRecords([]);
                  setItemWiseSales([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {salesLoading ? (
              <div className="py-8 text-center text-gray-500">Loading sales records...</div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-black flex flex-wrap gap-4">
                  <span>Total Sales: <strong>{Number(salesTotals.total_sales || 0)}</strong></span>
                  <span>Total Sales Qty: <strong>{Number(salesTotals.total_quantity || 0).toFixed(2)}</strong></span>
                  <span>Total Sales Amount: <strong>{Number(salesTotals.total_amount || 0).toFixed(2)}</strong></span>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">Item-wise Sales Qty</h4>
                  <div className="overflow-x-auto border border-gray-200 rounded-md">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sales Qty</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sales Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {itemWiseSales.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">No item-wise sales yet.</td>
                          </tr>
                        ) : (
                          itemWiseSales.map((line) => (
                            <tr key={`${line.inventory_item_id}-${line.item_code}`}>
                              <td className="px-4 py-2 text-sm text-gray-800">{line.item_name}</td>
                              <td className="px-4 py-2 text-sm text-gray-700">{line.item_code}</td>
                              <td className="px-4 py-2 text-sm text-gray-700">{line.unit || '-'}</td>
                              <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(line.total_qty || 0).toFixed(2)}</td>
                              <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(line.total_amount || 0).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-2">Sales History</h4>
                  <div className="overflow-x-auto border border-gray-200 rounded-md">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sale #</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {salesRecords.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">No sales records found.</td>
                          </tr>
                        ) : (
                          salesRecords.map((record) => (
                            <tr key={record.id}>
                              <td className="px-4 py-2 text-sm text-gray-800">{record.sale_number}</td>
                              <td className="px-4 py-2 text-sm text-gray-700">{new Date(record.sale_date).toLocaleString()}</td>
                              <td className="px-4 py-2 text-sm text-gray-700">{record.customer_name || '-'}</td>
                              <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(record.total_quantity || 0).toFixed(2)}</td>
                              <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(record.total_amount || 0).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
