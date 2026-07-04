'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function DistributionPaymentsPage() {
  const [token, setToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [assignedRouteId, setAssignedRouteId] = useState('');
  const [selectedRouteFilter, setSelectedRouteFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyCustomerId, setHistoryCustomerId] = useState<number | null>(null);
  const [historyCustomerSelect, setHistoryCustomerSelect] = useState('');
  const pageSize = 10;

  const [form, setForm] = useState({
    payment_number: '',
    distribution_invoice_id: '',
    customer_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: 'cash',
    reference_no: '',
    bank_name: '',
    status: 'received',
    notes: '',
  });

  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) router.push('/');
    else setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (token) {
      resolveAssignedRoute();
      fetchData();
    }
  }, [token]);

  const resolveAssignedRoute = async () => {
    const searchParams = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;

    const routeFromQuery = searchParams?.get('route_id');

    if (routeFromQuery) {
      setAssignedRouteId(routeFromQuery);
      localStorage.setItem('distribution_assigned_route_id', routeFromQuery);
    }

    const cachedRouteId = localStorage.getItem('distribution_assigned_route_id');
    if (cachedRouteId) {
      setAssignedRouteId(cachedRouteId);
    }

    try {
      const userRes = await axios.get('/api/user', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const employeeId = Number(userRes.data?.employee_id || userRes.data?.employee?.id || 0);
      const userData = userRes.data || {};
      const roleNames = [
        String(userData?.role || ''),
        ...(Array.isArray(userData?.roles) ? userData.roles.map((r: any) => String(r?.name || r || '')) : []),
      ].join(' ').toLowerCase();
      const adminUser = !employeeId || roleNames.includes('super admin') || roleNames.includes('admin');
      setIsAdmin(adminUser);

      if (adminUser) {
        const cachedAdminRoute = localStorage.getItem('distribution_admin_payment_route_filter') || '';
        const adminRoute = routeFromQuery || cachedAdminRoute;
        setAssignedRouteId('');
        if (adminRoute) {
          setSelectedRouteFilter(adminRoute);
        }
        return;
      }

      if (routeFromQuery) return;
      if (!employeeId) return;

      const loadsRes = await axios.get('/api/vehicle-loading/loads', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const loads = Array.isArray(loadsRes.data) ? loadsRes.data : (loadsRes.data?.data || []);
      const assignedLoad = loads
        .filter((load: any) => Number(load.sales_ref_id) === employeeId && ['pending', 'in_transit'].includes(load.status))
        .sort((a: any, b: any) => new Date(b.load_date || b.created_at || 0).getTime() - new Date(a.load_date || a.created_at || 0).getTime())[0];

      if (assignedLoad?.route_id) {
        const routeId = String(assignedLoad.route_id);
        setAssignedRouteId(routeId);
        localStorage.setItem('distribution_assigned_route_id', routeId);
      }
    } catch (error) {
      console.error('Error resolving assigned route on payments page:', error);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    localStorage.setItem('distribution_admin_payment_route_filter', selectedRouteFilter || '');
  }, [isAdmin, selectedRouteFilter]);

  const routeOptions = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach((customer) => {
      const routeId = String(customer?.route_id || '').trim();
      if (!routeId) return;
      const routeLabel = String(customer?.route?.route_name || customer?.route?.name || customer?.route_name || `Route ${routeId}`);
      if (!map.has(routeId)) {
        map.set(routeId, routeLabel);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers]);

  const activeRouteFilter = isAdmin ? selectedRouteFilter : assignedRouteId;

  const scopedCustomers = useMemo(() => {
    if (!activeRouteFilter) return customers;
    return customers.filter((customer) => String(customer?.route_id || '') === activeRouteFilter);
  }, [customers, activeRouteFilter]);

  const scopedCustomerIdSet = useMemo(
    () => new Set(scopedCustomers.map((customer) => Number(customer.id))),
    [scopedCustomers]
  );

  const scopedInvoices = useMemo(() => {
    if (!activeRouteFilter) return invoices;
    return invoices.filter((invoice) => scopedCustomerIdSet.has(Number(invoice?.customer_id || 0)));
  }, [invoices, scopedCustomerIdSet, activeRouteFilter]);

  const scopedPayments = useMemo(() => {
    if (!activeRouteFilter) return payments;
    return payments.filter((payment) => scopedCustomerIdSet.has(Number(payment?.customer_id || 0)));
  }, [payments, scopedCustomerIdSet, activeRouteFilter]);

  const getInvoiceDueAmount = (invoice: any): number => {
    const total = Number(invoice?.total || 0);
    const paidAmount = Number(invoice?.paid_amount || 0);
    const explicitDue = Number(invoice?.due_amount || invoice?.balance_amount || 0);

    if (explicitDue > 0) {
      return explicitDue;
    }

    return Math.max(0, total - paidAmount);
  };

  const dueInvoices = useMemo(
    () =>
      scopedInvoices.filter((invoice) => {
        const due = getInvoiceDueAmount(invoice);
        const status = String(invoice?.status || '').toLowerCase();
        return due > 0 && status !== 'paid' && status !== 'cancelled';
      }),
    [scopedInvoices]
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(scopedPayments.length / pageSize)),
    [scopedPayments.length]
  );

  const pagedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return scopedPayments.slice(start, start + pageSize);
  }, [scopedPayments, currentPage]);

  const customerDueInvoices = useMemo(() => {
    const customerId = Number(form.customer_id || 0);
    if (!customerId) return dueInvoices;
    return dueInvoices.filter((invoice) => Number(invoice?.customer_id || 0) === customerId);
  }, [dueInvoices, form.customer_id]);

  const outstandingDebtors = useMemo(() => {
    const customerById = new Map<number, any>();
    scopedCustomers.forEach((customer) => {
      customerById.set(Number(customer.id), customer);
    });

    const grouped = new Map<number, {
      customer_id: number;
      customer_name: string;
      customer_code: string;
      due_invoices: number;
      total_due: number;
      last_invoice_date: string;
    }>();

    dueInvoices.forEach((invoice) => {
      const customerId = Number(invoice?.customer_id || 0);
      if (!customerId) return;

      const due = getInvoiceDueAmount(invoice);
      const fallbackCustomer = customerById.get(customerId);
      const invoiceDate = String(invoice?.invoice_date || '');

      const current = grouped.get(customerId) || {
        customer_id: customerId,
        customer_name: invoice?.customer?.shop_name || fallbackCustomer?.shop_name || `Customer #${customerId}`,
        customer_code: invoice?.customer?.customer_code || fallbackCustomer?.customer_code || '-',
        due_invoices: 0,
        total_due: 0,
        last_invoice_date: '',
      };

      current.due_invoices += 1;
      current.total_due += due;
      if (!current.last_invoice_date || (invoiceDate && invoiceDate > current.last_invoice_date)) {
        current.last_invoice_date = invoiceDate;
      }

      grouped.set(customerId, current);
    });

    return Array.from(grouped.values()).sort((a, b) => b.total_due - a.total_due);
  }, [dueInvoices, scopedCustomers]);

  const totalOutstandingAmount = useMemo(
    () => outstandingDebtors.reduce((sum, row) => sum + Number(row.total_due || 0), 0),
    [outstandingDebtors]
  );

  const selectedHistoryCustomer = useMemo(() => {
    if (!historyCustomerId) return null;
    return scopedCustomers.find((customer) => Number(customer.id) === Number(historyCustomerId)) || null;
  }, [historyCustomerId, scopedCustomers]);

  const customerLedger = useMemo(() => {
    if (!historyCustomerId) return [] as Array<{
      date: string;
      type: string;
      reference: string;
      details: string;
      debit: number;
      credit: number;
      balance: number;
    }>;

    const customerInvoices = scopedInvoices
      .filter((invoice) => Number(invoice?.customer_id || 0) === Number(historyCustomerId))
      .map((invoice) => ({
        date: String(invoice?.invoice_date || ''),
        created_at: String(invoice?.created_at || ''),
        priority: 1,
        type: 'Invoice',
        reference: String(invoice?.invoice_number || `INV-${invoice?.id || ''}`),
        details: String(invoice?.status || 'pending'),
        debit: Number(invoice?.total || 0),
        credit: 0,
      }));

    const customerPayments = scopedPayments
      .filter((payment) => Number(payment?.customer_id || 0) === Number(historyCustomerId))
      .map((payment) => {
        const status = String(payment?.status || '').toLowerCase();
        const amount = Number(payment?.amount || 0);
        const isBounced = status === 'bounced';

        return {
          date: String(payment?.payment_date || ''),
          created_at: String(payment?.created_at || ''),
          priority: 2,
          type: isBounced ? 'Bounced Payment' : 'Payment',
          reference: String(payment?.payment_number || `PAY-${payment?.id || ''}`),
          details: `${String(payment?.payment_method || '-').replace('_', ' ')} | ${status || '-'}`,
          debit: isBounced ? amount : 0,
          credit: isBounced ? 0 : amount,
        };
      });

    const timeline = [...customerInvoices, ...customerPayments].sort((a, b) => {
      const ad = new Date(a.date || a.created_at || 0).getTime();
      const bd = new Date(b.date || b.created_at || 0).getTime();
      if (ad !== bd) return ad - bd;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a.reference || '').localeCompare(b.reference || '');
    });

    let runningBalance = 0;
    return timeline.map((entry) => {
      runningBalance += Number(entry.debit || 0) - Number(entry.credit || 0);
      return {
        date: entry.date,
        type: entry.type,
        reference: entry.reference,
        details: entry.details,
        debit: Number(entry.debit || 0),
        credit: Number(entry.credit || 0),
        balance: runningBalance,
      };
    });
  }, [historyCustomerId, scopedInvoices, scopedPayments]);

  const ledgerTotals = useMemo(() => {
    const debit = customerLedger.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const credit = customerLedger.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    const closingBalance = customerLedger.length ? Number(customerLedger[customerLedger.length - 1].balance || 0) : 0;

    return {
      debit,
      credit,
      closingBalance,
    };
  }, [customerLedger]);

  const openCustomerHistory = (customerId: number) => {
    setHistoryCustomerId(customerId);
    setShowHistoryModal(true);
  };

  const openSelectedCustomerHistory = () => {
    const customerId = Number(historyCustomerSelect || 0);
    if (!customerId) return;
    openCustomerHistory(customerId);
  };

  useEffect(() => {
    if (!form.distribution_invoice_id) return;
    const selectedInvoiceId = Number(form.distribution_invoice_id);
    const stillValid = customerDueInvoices.some((invoice) => Number(invoice.id) === selectedInvoiceId);

    if (!stillValid) {
      setForm((prev) => ({ ...prev, distribution_invoice_id: '' }));
    }
  }, [customerDueInvoices, form.distribution_invoice_id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [scopedPayments.length]);

  useEffect(() => {
    if (form.customer_id && !scopedCustomers.some((customer) => Number(customer.id) === Number(form.customer_id))) {
      setForm((prev) => ({
        ...prev,
        customer_id: '',
        distribution_invoice_id: '',
      }));
    }

    if (historyCustomerSelect && !scopedCustomers.some((customer) => Number(customer.id) === Number(historyCustomerSelect))) {
      setHistoryCustomerSelect('');
    }

    if (historyCustomerId && !scopedCustomers.some((customer) => Number(customer.id) === Number(historyCustomerId))) {
      setHistoryCustomerId(null);
      setShowHistoryModal(false);
    }
  }, [scopedCustomers, form.customer_id, historyCustomerSelect, historyCustomerId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [paymentsRes, customersRes, invoicesRes] = await Promise.all([
        axios.get('/api/distribution/payments', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 100 } }),
        axios.get('/api/distribution/customers', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
        axios.get('/api/distribution/invoices', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
      ]);

      setPayments(paymentsRes.data?.data?.data || []);
      setCustomers(customersRes.data?.data?.data || []);
      setInvoices(invoicesRes.data?.data?.data || []);
      setForm((prev) => ({ ...prev, payment_number: `PAY-${Date.now()}` }));
    } catch (error) {
      console.error('Error loading payments data:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const createPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.payment_method === 'check') {
      if (!form.reference_no.trim()) {
        alert('Cheque number is required for check payments.');
        return;
      }

      if (!form.bank_name.trim()) {
        alert('Bank name is required for check payments.');
        return;
      }
    }

    try {
      setSaving(true);
      await axios.post('/api/distribution/payments', {
        ...form,
        distribution_invoice_id: form.distribution_invoice_id ? Number(form.distribution_invoice_id) : null,
        customer_id: Number(form.customer_id),
        amount: Number(form.amount || 0),
      }, { headers: { Authorization: `Bearer ${token}` } });

      setForm({
        payment_number: `PAY-${Date.now()}`,
        distribution_invoice_id: '',
        customer_id: '',
        payment_date: new Date().toISOString().split('T')[0],
        amount: '',
        payment_method: 'cash',
        reference_no: '',
        bank_name: '',
        status: 'received',
        notes: '',
      });
      setShowPaymentModal(false);
      fetchData();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 h-auto">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg flex items-center justify-center text-white text-lg">
                  💵
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-semibold text-gray-900">Distribution Payments</h1>
                  <p className="text-xs text-gray-500">Register and track collected payments.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-start sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="px-4 py-2 bg-green-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-green-700"
              >
                Add Payment
              </button>
              <Link
                href="/dashboard/distribution"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to Distribution
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Route Filter</h2>
            {!isAdmin && assignedRouteId && (
              <span className="text-xs text-green-700 font-medium">Auto route filter enabled</span>
            )}
          </div>

          {isAdmin ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter By Route</label>
                <select
                  value={selectedRouteFilter}
                  onChange={(e) => setSelectedRouteFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                >
                  <option value="">All Routes</option>
                  {routeOptions.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1 flex sm:justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedRouteFilter('')}
                  className="w-full sm:w-auto px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Showing data for your allocated route only.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Customer Ledger View</h2>
            <p className="text-xs text-gray-500">Select a customer to open payment and invoice history ledger.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
              <select
                value={historyCustomerSelect}
                onChange={(e) => setHistoryCustomerSelect(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              >
                <option value="">Select Customer</option>
                {scopedCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.shop_name} {customer.customer_code ? `(${customer.customer_code})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1 flex sm:justify-end">
              <button
                type="button"
                onClick={openSelectedCustomerHistory}
                disabled={!historyCustomerSelect}
                className="w-full sm:w-auto px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                View History
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Outstanding Debtors</h2>
              <p className="text-xs text-gray-500">Customers with unpaid invoices and current due balances.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 sm:px-6 py-3 border-b border-gray-100 bg-gray-50">
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-[11px] text-gray-500 uppercase">Total Debtors</p>
              <p className="text-base font-semibold text-gray-900">{outstandingDebtors.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-[11px] text-gray-500 uppercase">Due Invoices</p>
              <p className="text-base font-semibold text-gray-900">{dueInvoices.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-[11px] text-gray-500 uppercase">Total Outstanding</p>
              <p className="text-base font-semibold text-red-700">{totalOutstandingAmount.toFixed(2)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Due Invoices</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Outstanding</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Last Invoice Date</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading...</td>
                  </tr>
                ) : outstandingDebtors.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No outstanding debtors right now.</td>
                  </tr>
                ) : (
                  outstandingDebtors.map((row) => (
                    <tr key={row.customer_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-700">{row.customer_name}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.customer_code}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 text-right">{row.due_invoices}</td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-red-700">{Number(row.total_due).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {row.last_invoice_date ? new Date(row.last_invoice_date).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        <button
                          type="button"
                          onClick={() => openCustomerHistory(Number(row.customer_id))}
                          className="px-3 py-1 text-xs rounded-md border border-green-200 text-green-700 hover:bg-green-50"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Payment records</h2>
              <p className="text-xs text-gray-500">Browse all distribution payment entries.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Payment</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Method</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td>
                  </tr>
                ) : scopedPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No payments yet.</td>
                  </tr>
                ) : (
                  pagedPayments.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-700">{row.payment_number}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.customer?.shop_name || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{row.invoice?.invoice_number || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 capitalize">{String(row.payment_method || '-').replace('_', ' ')}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{new Date(row.payment_date).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(row.amount).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-[11px] font-medium text-gray-700 capitalize">
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        <button
                          type="button"
                          onClick={() => openCustomerHistory(Number(row.customer_id || 0))}
                          disabled={!row.customer_id}
                          className="px-3 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          History
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {scopedPayments.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
              <div>
                {(() => {
                  const start = (currentPage - 1) * pageSize + 1;
                  const end = Math.min(scopedPayments.length, currentPage * pageSize);
                  return `Showing ${start}-${end} of ${scopedPayments.length} payments`;
                })()}
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-md border border-gray-300 bg-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="text-[11px] text-gray-500">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-md border border-gray-300 bg-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
          <div className="relative w-full h-[90vh] md:h-auto md:w-11/12 max-w-5xl mx-auto bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-gray-200 overflow-hidden md:max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between px-4 md:px-6 pt-4 pb-3 border-b border-gray-100 bg-gray-50/70 backdrop-blur-sm">
              <div>
                <h3 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900">Record new payment</h3>
                <p className="mt-0.5 text-xs sm:text-sm text-gray-500">Capture cash, check, or bank transfer collections.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 md:pb-6">
              <form onSubmit={createPayment} className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Payment Number</label>
                    <input
                      value={form.payment_number}
                      onChange={(e) => setForm({ ...form, payment_number: e.target.value })}
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                    <select
                      value={form.customer_id}
                      onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                      required
                    >
                      <option value="">Select Customer</option>
                      {scopedCustomers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.shop_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Linked Invoice (optional)</label>
                    <select
                      value={form.distribution_invoice_id}
                      onChange={(e) => setForm({ ...form, distribution_invoice_id: e.target.value })}
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                    >
                      <option value="">
                        {!form.customer_id
                          ? (dueInvoices.length ? 'Select customer first (or choose any due invoice)' : 'No due invoices available')
                          : (customerDueInvoices.length ? 'Select Invoice' : 'No due invoices for selected customer')}
                      </option>
                      {customerDueInvoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoice_number} - Due {getInvoiceDueAmount(invoice).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Payment Date</label>
                    <input
                      type="date"
                      value={form.payment_date}
                      onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
                    <select
                      value={form.payment_method}
                      onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {form.payment_method === 'check' ? 'Cheque No' : 'Reference No'}
                    </label>
                    <input
                      value={form.reference_no}
                      onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
                      placeholder={form.payment_method === 'check' ? 'Enter cheque number' : 'Reference / Cheque no'}
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                      required={form.payment_method === 'check'}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Bank Name {form.payment_method === 'check' ? '(required)' : ''}
                    </label>
                    <input
                      value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                      placeholder="Bank / Branch"
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                      required={form.payment_method === 'check'}
                    />
                  </div>
                </div>

                {form.payment_method === 'check' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Check payment selected: please provide cheque number and bank name.
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 items-end">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                    >
                      <option value="received">Received</option>
                      <option value="cleared">Cleared</option>
                      <option value="pending">Pending</option>
                      <option value="bounced">Bounced</option>
                    </select>
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                    <input
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      placeholder="Additional details"
                      className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                    />
                  </div>
                  <div className="md:col-span-1 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPaymentModal(false)}
                      className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full md:w-auto bg-green-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Register Payment'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-11/12 md:w-[960px] max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
            <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Customer Payment History</h3>
                <p className="text-xs text-gray-500">
                  {selectedHistoryCustomer?.shop_name || `Customer #${historyCustomerId || '-'}`}
                  {selectedHistoryCustomer?.customer_code ? ` (${selectedHistoryCustomer.customer_code})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                <p className="text-[11px] text-gray-500 uppercase">Total Debit</p>
                <p className="text-base font-semibold text-gray-900">{ledgerTotals.debit.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                <p className="text-[11px] text-gray-500 uppercase">Total Credit</p>
                <p className="text-base font-semibold text-green-700">{ledgerTotals.credit.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                <p className="text-[11px] text-gray-500 uppercase">Closing Balance</p>
                <p className={`text-base font-semibold ${ledgerTotals.closingBalance > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                  {Math.abs(ledgerTotals.closingBalance).toFixed(2)} {ledgerTotals.closingBalance > 0 ? 'Dr' : 'Cr'}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Reference</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Details</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Debit</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Credit</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Balance</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customerLedger.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No ledger entries for this customer.</td>
                    </tr>
                  ) : (
                    customerLedger.map((entry, index) => (
                      <tr key={`${entry.reference}-${index}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{entry.date ? new Date(entry.date).toLocaleDateString() : '-'}</td>
                        <td className="px-4 py-2 text-gray-700">{entry.type}</td>
                        <td className="px-4 py-2 text-gray-700">{entry.reference}</td>
                        <td className="px-4 py-2 text-gray-600">{entry.details}</td>
                        <td className="px-4 py-2 text-right text-gray-800">{entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                        <td className="px-4 py-2 text-right text-green-700">{entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-900">
                          {Math.abs(entry.balance).toFixed(2)} {entry.balance > 0 ? 'Dr' : 'Cr'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
