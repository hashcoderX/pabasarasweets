'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

interface Customer {
  id: number;
  shop_name: string;
  customer_code: string;
  owner_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  route_id?: number | null;
  route?: {
    id: number;
    name: string;
    origin: string;
    destination: string;
  } | null;
  outstanding?: number;
  status: 'active' | 'inactive';
}

interface RouteOption {
  id: number;
  name: string;
  origin: string;
  destination: string;
}

export default function DistributionCustomersPage() {
  const [token, setToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [assignedRouteId, setAssignedRouteId] = useState('');
  const [assignedRouteIds, setAssignedRouteIds] = useState<string[]>([]);
  const [selectedRouteFilter, setSelectedRouteFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [outstandingFilter, setOutstandingFilter] = useState<'all' | 'with_due' | 'zero_due'>('all');
  const [minOutstanding, setMinOutstanding] = useState('');
  const [maxOutstanding, setMaxOutstanding] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const pageSize = 10;
  const [formData, setFormData] = useState({
    shop_name: '',
    customer_code: '',
    owner_name: '',
    phone: '',
    address: '',
    route_id: '',
    outstanding: '',
    status: 'active' as 'active' | 'inactive',
  });
  const router = useRouter();

  const getRouteIdsFromLoad = (load: any): string[] => {
    const ids: string[] = [];

    if (load?.route_id) {
      ids.push(String(load.route_id));
    }

    if (Array.isArray(load?.load_routes)) {
      load.load_routes.forEach((entry: any) => {
        const routeId = String(entry?.route_id || '').trim();
        if (routeId) {
          ids.push(routeId);
        }
      });
    }

    return Array.from(new Set(ids));
  };

  const generateCustomerCode = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const datePart = `${now.getFullYear().toString().slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `CUS-${datePart}${timePart}-${randomPart}`;
  };

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
      fetchRoutes();
      resolveAssignedRoute();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchCustomers();
    }
  }, [token, assignedRouteId, assignedRouteIds, selectedRouteFilter, isAdmin]);

  const filteredCustomers = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const min = minOutstanding.trim() === '' ? null : Number(minOutstanding);
    const max = maxOutstanding.trim() === '' ? null : Number(maxOutstanding);

    return customers.filter((customer) => {
      const customerOutstanding = Number(customer.outstanding || 0);

      const matchesText = !q || [
        customer.shop_name,
        customer.customer_code,
        customer.owner_name || '',
        customer.phone || '',
        customer.address || '',
        customer.route?.name || '',
      ].some((value) => String(value).toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' || customer.status === statusFilter;

      const matchesOutstandingType =
        outstandingFilter === 'all' ||
        (outstandingFilter === 'with_due' && customerOutstanding > 0) ||
        (outstandingFilter === 'zero_due' && customerOutstanding <= 0);

      const matchesMin = min === null || Number.isNaN(min) || customerOutstanding >= min;
      const matchesMax = max === null || Number.isNaN(max) || customerOutstanding <= max;

      return matchesText && matchesStatus && matchesOutstandingType && matchesMin && matchesMax;
    });
  }, [customers, searchText, statusFilter, outstandingFilter, minOutstanding, maxOutstanding]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredCustomers.length]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredCustomers.length / pageSize)),
    [filteredCustomers.length, pageSize]
  );

  const pagedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  const visiblePages = useMemo(() => {
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [currentPage, totalPages]);

  const rowStart = filteredCustomers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rowEnd = Math.min(currentPage * pageSize, filteredCustomers.length);

  const routeFilterOptions = useMemo(() => {
    if (isAdmin) {
      return routes;
    }

    const allowedIds = new Set(
      assignedRouteIds.length > 0
        ? assignedRouteIds
        : (assignedRouteId ? [assignedRouteId] : [])
    );

    return routes.filter((route) => allowedIds.has(String(route.id)));
  }, [isAdmin, routes, assignedRouteIds, assignedRouteId]);

  useEffect(() => {
    if (isAdmin || !selectedRouteFilter) return;
    const allowedIds = new Set(routeFilterOptions.map((route) => String(route.id)));
    if (!allowedIds.has(selectedRouteFilter)) {
      setSelectedRouteFilter('');
    }
  }, [isAdmin, selectedRouteFilter, routeFilterOptions]);

  const resolveAssignedRoute = async () => {
    const routeFromQuery = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('route_id')
      : null;

    try {
      const userRes = await axios.get('/api/user', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const userData = userRes.data || {};
      const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
      const roleNames = [
        String(userData?.role || ''),
        ...(Array.isArray(userData?.roles) ? userData.roles.map((r: any) => String(r?.name || r || '')) : []),
      ].join(' ').toLowerCase();
      const adminUser = !employeeId || roleNames.includes('super admin') || roleNames.includes('admin');
      setIsAdmin(adminUser);

      if (adminUser) {
        const cachedAdminRoute = localStorage.getItem('distribution_admin_route_filter') || '';
        const adminRoute = routeFromQuery || cachedAdminRoute;
        setAssignedRouteId('');
        setAssignedRouteIds([]);
        if (adminRoute) {
          setSelectedRouteFilter(adminRoute);
        }
        return;
      }

      // For sales ref users, default to all allocated routes unless they manually pick one.
      setSelectedRouteFilter('');

      const cachedRouteId = localStorage.getItem('distribution_assigned_route_id');
      if (cachedRouteId) {
        setAssignedRouteId(cachedRouteId);
        setAssignedRouteIds([cachedRouteId]);
      }
      if (!employeeId) return;

      const loadsRes = await axios.get('/api/vehicle-loading/loads', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const loads = Array.isArray(loadsRes.data) ? loadsRes.data : (loadsRes.data?.data || []);
      const assignedLoad = loads
        .filter((load: any) => Number(load.sales_ref_id) === employeeId && ['pending', 'in_transit'].includes(load.status))
        .sort((a: any, b: any) => new Date(b.load_date || b.created_at || 0).getTime() - new Date(a.load_date || a.created_at || 0).getTime())[0];

      const assignedRouteIdsFromLoad = assignedLoad ? getRouteIdsFromLoad(assignedLoad) : [];

      if (assignedRouteIdsFromLoad.length > 0) {
        setAssignedRouteId(assignedRouteIdsFromLoad[0]);
        setAssignedRouteIds(assignedRouteIdsFromLoad);
        localStorage.setItem('distribution_assigned_route_id', assignedRouteIdsFromLoad[0]);
      } else if (routeFromQuery) {
        setAssignedRouteId(routeFromQuery);
        setAssignedRouteIds([routeFromQuery]);
        localStorage.setItem('distribution_assigned_route_id', routeFromQuery);
      } else {
        setAssignedRouteId('');
        setAssignedRouteIds([]);
        localStorage.removeItem('distribution_assigned_route_id');
      }
    } catch (error) {
      console.error('Error resolving assigned route on customers page:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const customersRes = await axios.get('/api/distribution/customers', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 }
      });

      const allCustomers: Customer[] = customersRes.data?.data?.data || [];
      const routeFilterId = selectedRouteFilter.trim();

      const baseCustomers = isAdmin
        ? allCustomers
        : (assignedRouteIds.length > 0
          ? allCustomers.filter((customer) => assignedRouteIds.includes(String(customer.route_id || '')))
          : (assignedRouteId
            ? allCustomers.filter((customer) => String(customer.route_id || '') === assignedRouteId)
            : allCustomers));

      const scopedCustomers = routeFilterId
        ? baseCustomers.filter((customer) => String(customer.route_id || '') === routeFilterId)
        : baseCustomers;

      setCustomers(
        scopedCustomers.map((customer) => ({
          ...customer,
          outstanding: Number(customer.outstanding ?? 0),
        }))
      );
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await axios.get('/api/vehicle-loading/routes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRoutes(Array.isArray(res.data) ? res.data : (res.data?.data || []));
    } catch (error) {
      console.error('Error fetching routes:', error);
      setRoutes([]);
    }
  };

  const resetForm = () => {
    setFormData({
      shop_name: '',
      customer_code: generateCustomerCode(),
      owner_name: '',
      phone: '',
      address: '',
      route_id: isAdmin ? selectedRouteFilter : (assignedRouteId || ''),
      outstanding: '',
      status: 'active',
    });
    setEditingCustomer(null);
  };

  useEffect(() => {
    if (!isAdmin) return;
    localStorage.setItem('distribution_admin_route_filter', selectedRouteFilter || '');
  }, [isAdmin, selectedRouteFilter]);

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      shop_name: customer.shop_name,
      customer_code: customer.customer_code,
      owner_name: customer.owner_name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      route_id: customer.route_id ? String(customer.route_id) : '',
      outstanding: String(customer.outstanding ?? ''),
      status: customer.status,
    });
    setShowModal(true);
  };

  const routeLabel = useMemo(() => {
    if (assignedRouteIds.length > 0) {
      if (assignedRouteIds.length === 1) {
        const selectedRoute = routes.find((route) => String(route.id) === assignedRouteIds[0]);
        if (!selectedRoute) return `Route #${assignedRouteIds[0]}`;
        return `${selectedRoute.name} (${selectedRoute.origin} G�� ${selectedRoute.destination})`;
      }
      return `${assignedRouteIds.length} routes allocated`;
    }

    if (!assignedRouteId) return '';
    const selectedRoute = routes.find((route) => String(route.id) === assignedRouteId);
    if (!selectedRoute) return `Route #${assignedRouteId}`;
    return `${selectedRoute.name} (${selectedRoute.origin} G�� ${selectedRoute.destination})`;
  }, [routes, assignedRouteId, assignedRouteIds]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      if (editingCustomer) {
        await axios.put(`/api/distribution/customers/${editingCustomer.id}`, {
          ...formData,
          route_id: formData.route_id ? Number(formData.route_id) : null,
          outstanding: Number(formData.outstanding || 0),
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('/api/distribution/customers', {
          ...formData,
          route_id: formData.route_id ? Number(formData.route_id) : null,
          outstanding: Number(formData.outstanding || 0),
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setShowModal(false);
      resetForm();
      fetchCustomers();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async (customer: Customer) => {
    if (!confirm(`Delete customer ${customer.shop_name}?`)) {
      return;
    }

    try {
      await axios.delete(`/api/distribution/customers/${customer.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchCustomers();
    } catch {
      alert('Failed to delete customer');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_100%)]">
        <div className="h-14 w-14 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.10),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_55%,_#f8fafc_100%)]">
      <nav className="border-b border-white/60 bg-white/85 shadow-sm backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 h-auto">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl flex items-center justify-center text-white text-lg shadow-lg shadow-emerald-200/70">
                  =���
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-semibold text-slate-900">Distribution Customers</h1>
                  <p className="text-xs text-slate-500">Create, edit and delete customer shops</p>
                </div>
              </div>
            </div>
            <div className="flex justify-start sm:justify-end">
              <button
                onClick={() => router.push('/dashboard')}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900">Customers (Shops)</h1>
            <p className="mt-2 text-sm sm:text-base md:text-lg text-slate-600">
              Register and manage distribution customers.
            </p>
            {!isAdmin && assignedRouteId && (
              <p className="mt-1 text-sm font-semibold text-emerald-700">Auto route: {routeLabel}</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <button
              onClick={() => router.back()}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto"
            >
              Back
            </button>
            <button
              onClick={() => router.push('/dashboard/distribution')}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto"
            >
              Distribution Home
            </button>
            <button
              onClick={openCreate}
              className="w-full rounded-xl border border-transparent bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700 sm:w-auto"
            >
              Add Customer
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-white/70 bg-white/90 p-3 shadow-[0_18px_65px_-35px_rgba(16,185,129,0.45)] backdrop-blur-lg sm:p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-700">Advanced Search</h2>
            <p className="text-xs text-slate-500">Search by shop/code/contact and filter by status and outstanding amount.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 sm:gap-4 items-end">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</label>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Shop, code, owner, phone, address"
                className="w-full rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Route</label>
              <select
                value={selectedRouteFilter}
                onChange={(e) => setSelectedRouteFilter(e.target.value)}
                className="w-full rounded-xl border border-cyan-200 bg-gradient-to-b from-white to-cyan-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
              >
                <option value="">{isAdmin ? 'All Routes' : 'All Allocated Routes'}</option>
                {routeFilterOptions.map((route) => (
                  <option key={route.id} value={String(route.id)}>
                    {route.name} ({route.origin} G�� {route.destination})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="w-full rounded-xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outstanding</label>
              <select
                value={outstandingFilter}
                onChange={(e) => setOutstandingFilter(e.target.value as 'all' | 'with_due' | 'zero_due')}
                className="w-full rounded-xl border border-cyan-200 bg-gradient-to-b from-white to-cyan-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
              >
                <option value="all">All</option>
                <option value="with_due">With Due</option>
                <option value="zero_due">Zero Due</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Min Outstanding</label>
              <input
                type="number"
                step="0.01"
                value={minOutstanding}
                onChange={(e) => setMinOutstanding(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Max Outstanding</label>
              <input
                type="number"
                step="0.01"
                value={maxOutstanding}
                onChange={(e) => setMaxOutstanding(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-slate-500">Matched {filteredCustomers.length} of {customers.length} customer(s).</p>
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                setSelectedRouteFilter('');
                setStatusFilter('all');
                setOutstandingFilter('all');
                setMinOutstanding('');
                setMaxOutstanding('');
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-[0_18px_65px_-35px_rgba(16,185,129,0.45)] backdrop-blur-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Shops Table</h2>
            <div className="text-sm text-slate-600">Showing {rowStart} to {rowEnd} of {filteredCustomers.length}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100/80">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Shop Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Owner</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Route</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outstanding</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">No customers found.</td>
                  </tr>
                ) : (
                  pagedCustomers.map((customer) => (
                    <tr key={customer.id} className="transition hover:bg-emerald-50/35">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">{customer.shop_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{customer.customer_code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{customer.owner_name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{customer.phone || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{customer.route?.name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 text-right">{Number(customer.outstanding || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                          customer.status === 'active' ? 'border border-emerald-200 bg-emerald-100 text-emerald-700' : 'border border-slate-200 bg-slate-100 text-slate-700'
                        }`}>
                          {customer.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEdit(customer)}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteCustomer(customer)}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
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

          {filteredCustomers.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">Page {currentPage} of {totalPages}</div>
              <div className="inline-flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                {visiblePages.map((pageNo) => (
                  <button
                    key={pageNo}
                    type="button"
                    onClick={() => setCurrentPage(pageNo)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      currentPage === pageNo
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pageNo}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 px-3 py-6 backdrop-blur-sm sm:px-4">
          <div className="relative mx-auto w-full max-w-3xl rounded-3xl border border-white/70 bg-white/92 p-5 shadow-[0_30px_90px_-35px_rgba(16,185,129,0.55)] backdrop-blur-xl sm:p-6">
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">
                  {editingCustomer ? 'Edit Customer Shop' : 'Create Customer Shop'}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Capture complete shop details with route mapping and outstanding balance.
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                Customer Profile
              </span>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Shop Name</label>
                  <input
                    type="text"
                    value={formData.shop_name}
                    onChange={(e) => setFormData({ ...formData, shop_name: e.target.value })}
                    className="w-full rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Customer Code</label>
                  <input
                    type="text"
                    value={formData.customer_code}
                    onChange={(e) => setFormData({ ...formData, customer_code: e.target.value })}
                    className="w-full rounded-xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Owner Name</label>
                  <input
                    type="text"
                    value={formData.owner_name}
                    onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Route</label>
                  <select
                    value={formData.route_id}
                    onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
                    disabled={assignedRouteIds.length > 0 || !!assignedRouteId}
                    className="w-full rounded-xl border border-cyan-200 bg-gradient-to-b from-white to-cyan-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    <option value="">Select Route</option>
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>{route.name} ({route.origin} G�� {route.destination})</option>
                    ))}
                  </select>
                  {(assignedRouteIds.length > 0 || assignedRouteId) && (
                    <p className="mt-1 text-xs font-medium text-emerald-700">Route is auto-locked from your allocated load routes.</p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full rounded-xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Outstanding</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.outstanding}
                    onChange={(e) => setFormData({ ...formData, outstanding: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                  rows={3}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl border border-transparent bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
