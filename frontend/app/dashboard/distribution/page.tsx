'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../lib/apiClient';

interface RouteCustomer {
  id: number;
  shop_name: string;
  customer_code: string;
  outstanding?: number;
  route_id?: number | null;
}

export default function DistributionPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [routeResolving, setRouteResolving] = useState(true);
  const [assignedRouteId, setAssignedRouteId] = useState<number | null>(null);
  const [assignedRouteName, setAssignedRouteName] = useState('');
  const [customerCount, setCustomerCount] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [returnCount, setReturnCount] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [routeCustomers, setRouteCustomers] = useState<RouteCustomer[]>([]);
  const [routeCustomersLoading, setRouteCustomersLoading] = useState(false);
  const router = useRouter();

  const api = useMemo(() => createApiClient(token), [token]);

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
      fetchStats();
      resolveAssignedRoute();
    }
  }, [token]);

  useEffect(() => {
    if (token && assignedRouteId) {
      fetchRouteCustomers();
    } else {
      setRouteCustomers([]);
    }
  }, [token, assignedRouteId]);

  const handleUnauthorized = (error: unknown) => {
    if (isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem('token');
      setToken('');
      router.push('/');
      return true;
    }

    return false;
  };

  const resolveAssignedRoute = async () => {
    try {
      setRouteResolving(true);

      const userRes = await api.get('/user');

      const employeeId = Number(userRes.data?.employee_id || userRes.data?.employee?.id || 0);
      if (!employeeId) {
        setAssignedRouteId(null);
        setAssignedRouteName('');
        localStorage.removeItem('distribution_assigned_route_id');
        localStorage.removeItem('distribution_assigned_route_name');
        return;
      }

      const loadsRes = await api.get('/vehicle-loading/loads');

      const loads = Array.isArray(loadsRes.data) ? loadsRes.data : (loadsRes.data?.data || []);
      const activeAssignedLoads = loads
        .filter((load: any) => Number(load.sales_ref_id) === employeeId && ['pending', 'in_transit'].includes(load.status))
        .sort((a: any, b: any) => new Date(b.load_date || b.created_at || 0).getTime() - new Date(a.load_date || a.created_at || 0).getTime());

      const assignedLoad = activeAssignedLoads[0];
      if (!assignedLoad?.route_id) {
        setAssignedRouteId(null);
        setAssignedRouteName('');
        localStorage.removeItem('distribution_assigned_route_id');
        localStorage.removeItem('distribution_assigned_route_name');
        return;
      }

      const routeId = Number(assignedLoad.route_id);
      const routeName = assignedLoad.route?.name || '';

      setAssignedRouteId(routeId);
      setAssignedRouteName(routeName);
      localStorage.setItem('distribution_assigned_route_id', String(routeId));
      localStorage.setItem('distribution_assigned_route_name', routeName);
    } catch (error) {
      if (handleUnauthorized(error)) return;
      console.error('Error resolving assigned route:', error);
      const cachedRouteId = localStorage.getItem('distribution_assigned_route_id');
      const cachedRouteName = localStorage.getItem('distribution_assigned_route_name') || '';
      if (cachedRouteId) {
        setAssignedRouteId(Number(cachedRouteId));
        setAssignedRouteName(cachedRouteName);
      }
    } finally {
      setRouteResolving(false);
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [customersRes, invoicesRes, returnsRes, paymentsRes] = await Promise.all([
        api.get('/distribution/customers', { params: { per_page: 1 } }),
        api.get('/distribution/invoices', { params: { per_page: 1 } }),
        api.get('/distribution/returns', { params: { per_page: 1 } }),
        api.get('/distribution/payments', { params: { per_page: 1 } }),
      ]);

      setCustomerCount(Number(customersRes.data?.data?.total) || 0);
      setInvoiceCount(Number(invoicesRes.data?.data?.total) || 0);
      setReturnCount(Number(returnsRes.data?.data?.total) || 0);
      setPaymentCount(Number(paymentsRes.data?.data?.total) || 0);
    } catch (error) {
      if (handleUnauthorized(error)) return;
      console.error('Error fetching distribution stats:', error);
      setCustomerCount(0);
      setInvoiceCount(0);
      setReturnCount(0);
      setPaymentCount(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchRouteCustomers = async () => {
    try {
      setRouteCustomersLoading(true);
      const res = await api.get('/distribution/customers', {
        params: { per_page: 100 },
      });

      const allCustomers: RouteCustomer[] = res.data?.data?.data || [];
      const filtered = allCustomers.filter((customer) =>
        String(customer.route_id ?? '') === String(assignedRouteId ?? '')
      );

      setRouteCustomers(filtered);
    } catch (error) {
      if (handleUnauthorized(error)) return;
      console.error('Error fetching route customers on distribution dashboard:', error);
      setRouteCustomers([]);
    } finally {
      setRouteCustomersLoading(false);
    }
  };

  const modules = [
    { name: 'Customers (Shops)', icon: '🏪', path: '/dashboard/distribution/customers', stat: customerCount, desc: 'Register and manage shops' },
    { name: 'Invoices', icon: '🧾', path: '/dashboard/distribution/invoices', stat: invoiceCount, desc: 'Create and track invoices' },
    { name: 'Returns', icon: '↩️', path: '/dashboard/distribution/returns', stat: returnCount, desc: 'Manage customer returns' },
    { name: 'Payments', icon: '💳', path: '/dashboard/distribution/payments', stat: paymentCount, desc: 'Check, cash, and bank transfers' },
    { name: 'Reports', icon: '📊', path: '/dashboard/reports', stat: 2, desc: 'Sales and delivery balance reports' },
  ];

  const getModulePath = (path: string) => {
    if (path === '/dashboard/reports') return path;
    if (!assignedRouteId) return path;
    return `${path}?route_id=${assignedRouteId}`;
  };

  if (!token) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-teal-50 to-emerald-50">
      <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-green-600">
                <span>←</span>
                <span className="font-medium text-sm sm:text-base">Back to Dashboard</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Distribution Active</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="text-center">
          <div className="inline-block p-1 bg-gradient-to-r from-green-500 to-teal-500 rounded-full mb-4">
            <div className="bg-white rounded-full p-4 text-4xl">🚚</div>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">Distribution Management</h1>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 mt-2 px-2">Manage shops, invoices, returns, and payments.</p>
          {routeResolving ? (
            <p className="text-sm text-gray-500 mt-3">Detecting assigned route...</p>
          ) : assignedRouteId ? (
            <p className="text-sm text-green-700 mt-3 font-medium">
              Auto route enabled: {assignedRouteName || `Route #${assignedRouteId}`}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {modules.map((module) => (
            <Link key={module.name} href={getModulePath(module.path)} className="group bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl border border-white/20 p-6 transition-all hover:-translate-y-1">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 text-white text-2xl flex items-center justify-center">{module.icon}</div>
                <div className="text-xs text-gray-500">{loading ? '...' : `${module.stat} records`}</div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{module.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{module.desc}</p>
            </Link>
          ))}
        </div>

        {assignedRouteId && (
          <section className="mt-8">
            <div className="bg-white/80 backdrop-blur-sm border border-white/40 rounded-2xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Allocated Route Customers</h2>
                  <p className="text-xs text-gray-500">
                    Shops on your auto-assigned route.
                  </p>
                </div>
                <Link
                  href={getModulePath('/dashboard/distribution/customers')}
                  className="text-xs font-medium text-green-700 hover:text-green-900"
                >
                  View all →
                </Link>
              </div>

              {routeCustomersLoading ? (
                <p className="text-sm text-gray-500">Loading customers...</p>
              ) : routeCustomers.length === 0 ? (
                <p className="text-sm text-gray-500">No customers found for this route.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {routeCustomers.slice(0, 9).map((customer) => (
                    <div
                      key={customer.id}
                      className="border border-gray-100 rounded-xl p-4 bg-white/70 hover:bg-green-50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {customer.shop_name}
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {customer.customer_code}
                        </span>
                      </div>
                      {typeof customer.outstanding === 'number' && (
                        <p className="text-xs text-gray-700 mt-1">
                          Outstanding: <span className="font-semibold">{customer.outstanding.toFixed(2)}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
