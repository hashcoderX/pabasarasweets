'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface Vehicle {
  id: number;
  registration_number: string;
  type: string;
  capacity_kg: number;
  status: string;
}

interface Driver {
  id: number;
  first_name: string;
  last_name: string;
  employee_code: string;
}

interface Route {
  id: number;
  name: string;
  origin: string;
  destination: string;
  distance_km: number;
}

interface Load {
  id: number;
  load_number: string;
  vehicle_id: number;
  driver_id: number;
  sales_ref_id?: number | null;
  route_id: number;
  status: 'pending' | 'in_transit' | 'delivered' | 'cancelled';
  load_date: string;
  delivery_date: string | null;
  total_weight: number;
  notes: string;
  vehicle?: {
    id: number;
    registration_number: string;
    type: string;
  };
  driver?: {
    id: number;
    name: string;
    license_number: string;
  };
  sales_ref?: {
    id: number;
    name: string;
    employee_code: string;
    first_name: string;
    last_name: string;
  };
  route?: {
    id: number;
    name: string;
    origin: string;
    destination: string;
  };
}

interface LoadItem {
  id: number;
  load_id: number;
  product_code: string;
  name: string;
  type: string;
  out_price: number;
  sell_price: number;
  qty: number;
}

interface LoadDeliverySummary {
  load: {
    id: number;
    load_number: string;
    status: string;
    load_date: string;
    delivery_date: string | null;
  };
  period: {
    from: string;
    to: string;
  };
  invoices: {
    count: number;
    total_amount: number;
    total_cost: number;
    total_profit: number;
  };
  payments: {
    total_collected: number;
    by_method: Record<string, { total: number; count: number }>;
    cheques: Array<{
      id: number;
      payment_number: string;
      payment_date: string;
      amount: number;
      payment_method: string;
      reference_no: string | null;
      bank_name: string | null;
      status: string;
    }>;
  };
  items: Array<{
    item_code: string;
    item_name: string;
    unit: string | null;
    sold_qty: number;
    sold_value: number;
    return_qty: number;
    return_value: number;
    net_qty: number;
    net_value: number;
    cost_value: number;
    profit: number;
  }>;
}

interface DistributionInvoiceListResponse {
  data?: {
    data?: DistributionInvoiceRecord[];
  };
}

interface DistributionInvoiceRecord {
  id: number;
  load_id?: number | null;
  invoice_number?: string;
  customer_id?: number;
  total?: number;
  discount?: number;
  customer?: {
    shop_name?: string;
    customer_code?: string;
  };
  items?: DistributionInvoiceItemRecord[];
}

interface DistributionInvoiceItemRecord {
  item_code: string;
  item_name: string;
  quantity: number;
  unit_price: number;
}

interface SoldItemProfitRow {
  item_code: string;
  item_name: string;
  sold_qty: number;
  avg_unit_price: number;
  gross_sales: number;
  discount_allocated: number;
  net_sales: number;
  out_price: number;
  cost_value: number;
  profit: number;
}

interface DistributionPaymentListResponse {
  data?: {
    data?: DistributionPaymentRecord[];
  };
}

interface DistributionPaymentRecord {
  id: number;
  load_id?: number | null;
  distribution_invoice_id?: number | null;
  customer_id?: number;
  payment_number?: string;
  payment_date?: string;
  amount?: number;
  payment_method?: string;
  reference_no?: string | null;
  bank_name?: string | null;
  status?: string;
  customer?: {
    shop_name?: string;
    customer_code?: string;
  };
  invoice?: {
    invoice_number?: string;
  };
}

interface LoadCustomerBaseRow {
  customer_id: number;
  customer_name: string;
  customer_code: string;
  invoices_count: number;
  total_sale: number;
  collected: number;
  balance: number;
}

interface DeliveryCashTransactionRecord {
  id: number | string;
  date: string;
  type: 'in' | 'out';
  amount: number;
  reference?: string | null;
  note?: string | null;
}

interface LoadExpenseRecord {
  id: number | string;
  load_id: number;
  expense_date: string;
  expense_type: string;
  amount: number;
  reference?: string | null;
  note?: string | null;
}

const PAGE_SIZE = 10;

export default function LoadsPage() {
  const [token, setToken] = useState('');
  const [loads, setLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedLoadDetails, setSelectedLoadDetails] = useState<Load | null>(null);
  const [selectedLoadItems, setSelectedLoadItems] = useState<LoadItem[]>([]);
  const [soldItemProfitRows, setSoldItemProfitRows] = useState<SoldItemProfitRow[]>([]);
  const [loadInvoices, setLoadInvoices] = useState<DistributionInvoiceRecord[]>([]);
  const [loadPayments, setLoadPayments] = useState<DistributionPaymentRecord[]>([]);
  const [editingLoad, setEditingLoad] = useState<Load | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [salesRefs, setSalesRefs] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'complete'; load: Load } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Load['status']>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [deliverySummary, setDeliverySummary] = useState<LoadDeliverySummary | null>(null);
  const [deliveryCashBalance, setDeliveryCashBalance] = useState(0);
  const [loadExpenses, setLoadExpenses] = useState<LoadExpenseRecord[]>([]);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [expenseSuccess, setExpenseSuccess] = useState('');
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    category: 'fuel',
    amount: '',
    note: ''
  });
  const [formData, setFormData] = useState({
    load_number: '',
    vehicle_id: '',
    driver_id: '',
    sales_ref_id: '',
    route_id: '',
    load_date: '',
    notes: ''
  });
  const router = useRouter();

  const soldProfitTotals = useMemo(() => {
    return soldItemProfitRows.reduce(
      (acc, row) => {
        acc.gross += Number(row.gross_sales || 0);
        acc.discount += Number(row.discount_allocated || 0);
        acc.net += Number(row.net_sales || 0);
        acc.cost += Number(row.cost_value || 0);
        acc.profit += Number(row.profit || 0);
        return acc;
      },
      { gross: 0, discount: 0, net: 0, cost: 0, profit: 0 }
    );
  }, [soldItemProfitRows]);

  const customerBaseRows = useMemo<LoadCustomerBaseRow[]>(() => {
    const grouped = new Map<number, LoadCustomerBaseRow>();

    loadInvoices.forEach((inv) => {
      const customerId = Number(inv.customer_id || 0);
      if (!customerId) return;

      const existing = grouped.get(customerId) || {
        customer_id: customerId,
        customer_name: inv.customer?.shop_name || `Customer #${customerId}`,
        customer_code: inv.customer?.customer_code || '-',
        invoices_count: 0,
        total_sale: 0,
        collected: 0,
        balance: 0,
      };

      existing.invoices_count += 1;
      existing.total_sale += Number(inv.total || 0);
      grouped.set(customerId, existing);
    });

    loadPayments.forEach((pay) => {
      const customerId = Number(pay.customer_id || 0);
      if (!customerId) return;

      const existing = grouped.get(customerId) || {
        customer_id: customerId,
        customer_name: pay.customer?.shop_name || `Customer #${customerId}`,
        customer_code: pay.customer?.customer_code || '-',
        invoices_count: 0,
        total_sale: 0,
        collected: 0,
        balance: 0,
      };

      existing.collected += Number(pay.amount || 0);
      grouped.set(customerId, existing);
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        balance: row.total_sale - row.collected,
      }))
      .sort((a, b) => b.total_sale - a.total_sale);
  }, [loadInvoices, loadPayments]);

  const toDeliveryCashRows = (payload: any): DeliveryCashTransactionRecord[] => {
    const rows = Array.isArray(payload)
      ? payload
      : (payload?.data?.data || payload?.data || []);

    if (!Array.isArray(rows)) return [];

    return rows.map((row: any) => ({
      id: row.id,
      date: String(row.date || ''),
      type: row.type === 'in' ? 'in' : 'out',
      amount: Number(row.amount || 0),
      reference: row.reference ?? null,
      note: row.note ?? null,
    }));
  };

  const toLoadExpenseRows = (payload: any): LoadExpenseRecord[] => {
    const rows = Array.isArray(payload)
      ? payload
      : (payload?.data || []);

    if (!Array.isArray(rows)) return [];

    return rows.map((row: any) => ({
      id: row.id,
      load_id: Number(row.load_id || 0),
      expense_date: String(row.expense_date || ''),
      expense_type: String(row.expense_type || 'other'),
      amount: Number(row.amount || 0),
      reference: row.reference ?? null,
      note: row.note ?? null,
    }));
  };

  const calculateDeliveryCashBalance = (transactions: DeliveryCashTransactionRecord[]) => {
    return transactions.reduce((sum, tx) => {
      const amount = Number(tx.amount || 0);
      return tx.type === 'in' ? sum + amount : sum - amount;
    }, 0);
  };

  const formatExpenseCategory = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return 'Other';
    return raw
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const refreshDeliveryCashForLoad = async (loadId?: number) => {
    const response = await axios.get('/api/delivery-cash-transactions', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: { per_page: 1000 },
    });

    const allTransactions = toDeliveryCashRows(response.data);
    setDeliveryCashBalance(calculateDeliveryCashBalance(allTransactions));

    if (loadId) {
      const expensesRes = await axios.get(`/api/vehicle-loading/loads/${loadId}/expenses`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setLoadExpenses(toLoadExpenseRows(expensesRes.data));
    }
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
      fetchLoads();
      fetchVehicles();
      fetchDrivers();
      fetchRoutes();
      refreshDeliveryCashForLoad().catch((error) => {
        console.error('Error fetching delivery cash transactions:', error);
      });
    }
  }, [token]);

  const fetchLoads = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vehicle-loading/loads', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setLoads(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching loads:', error);
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const response = await axios.get('/api/vehicle-loading/vehicles', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setVehicles(Array.isArray(response.data) ? response.data : (response.data.data || []));
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      setVehicles([]);
    }
  };

  const fetchDrivers = async () => {
    try {
      const response = await axios.get('/api/hr/employees', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const employeeList = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || []);
      const onlyDrivers = employeeList.filter((employee: any) => {
        const designationName = String(employee?.designation?.name || '').toLowerCase();
        return designationName.includes('driver');
      });
      setDrivers(onlyDrivers);
      const onlySalesRefs = employeeList.filter((employee: any) => {
        const designationName = String(employee?.designation?.name || '').toLowerCase();
        return designationName.includes('sales');
      });
      setSalesRefs(onlySalesRefs);
    } catch (error) {
      console.error('Error fetching drivers:', error);
      setDrivers([]);
      setSalesRefs([]);
    }
  };

  const fetchRoutes = async () => {
    try {
      const response = await axios.get('/api/vehicle-loading/routes', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setRoutes(Array.isArray(response.data) ? response.data : (response.data.data || []));
    } catch (error) {
      console.error('Error fetching routes:', error);
      setRoutes([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        load_number: formData.load_number,
        vehicle_id: parseInt(formData.vehicle_id),
        driver_id: parseInt(formData.driver_id),
        sales_ref_id: formData.sales_ref_id ? parseInt(formData.sales_ref_id) : null,
        route_id: parseInt(formData.route_id),
        load_date: formData.load_date,
        notes: formData.notes
      };

      if (editingLoad) {
        await axios.put(`/api/vehicle-loading/loads/${editingLoad.id}`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } else {
        await axios.post('/api/vehicle-loading/loads', payload, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      setShowModal(false);
      setEditingLoad(null);
      resetForm();
      fetchLoads(); // Refresh the list
    } catch (error) {
      console.error('Error saving load:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      load_number: '',
      vehicle_id: '',
      driver_id: '',
      sales_ref_id: '',
      route_id: '',
      load_date: '',
      notes: ''
    });
  };

  const generateLoadNumber = () => {
    const currentYear = new Date().getFullYear();
    const prefix = `VL-${currentYear}-`;
    
    // Find the highest number for the current year
    const currentYearLoads = loads.filter(load => load.load_number.startsWith(prefix));
    let nextNumber = 1;
    
    if (currentYearLoads.length > 0) {
      const numbers = currentYearLoads.map(load => {
        const parts = load.load_number.split('-');
        return parseInt(parts[2]) || 0;
      });
      nextNumber = Math.max(...numbers) + 1;
    }
    
    return `${prefix}${nextNumber.toString().padStart(3, '0')}`;
  };

  const handleEdit = (load: Load) => {
    setEditingLoad(load);
    setFormData({
      load_number: load.load_number,
      vehicle_id: load.vehicle_id.toString(),
      driver_id: load.driver_id.toString(),
      sales_ref_id: load.sales_ref_id ? load.sales_ref_id.toString() : '',
      route_id: load.route_id.toString(),
      load_date: load.load_date,
      notes: load.notes
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`/api/vehicle-loading/loads/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      fetchLoads(); // Refresh the list
    } catch (error) {
      console.error('Error deleting load:', error);
      alert('Failed to delete load');
    }
  };

  const handleCompleteLoad = async (load: Load) => {
    try {
      const today = new Date();
      const loadDate = new Date(load.load_date);
      const effectiveDate = loadDate > today ? loadDate : today;
      const year = effectiveDate.getFullYear();
      const month = String(effectiveDate.getMonth() + 1).padStart(2, '0');
      const day = String(effectiveDate.getDate()).padStart(2, '0');
      const deliveryDate = `${year}-${month}-${day}`;

      await axios.put(`/api/vehicle-loading/loads/${load.id}`, {
        load_number: load.load_number,
        vehicle_id: load.vehicle_id,
        driver_id: load.driver_id,
        sales_ref_id: load.sales_ref_id ?? null,
        route_id: load.route_id,
        status: 'delivered',
        load_date: load.load_date,
        delivery_date: deliveryDate,
        total_weight: load.total_weight,
        notes: load.notes,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      fetchLoads();
    } catch (error) {
      console.error('Error completing load:', error);
      alert('Failed to complete load');
    }
  };

  const computeSoldItemsProfit = (
    loadItems: LoadItem[],
    invoices: DistributionInvoiceRecord[]
  ): { rows: SoldItemProfitRow[]; totals: { gross: number; discount: number; net: number; cost: number; profit: number } } => {
    const costByCode = new Map<string, number>();
    const nameByCode = new Map<string, string>();

    loadItems.forEach((li) => {
      const code = String(li.product_code || '').trim();
      if (!code) return;
      costByCode.set(code, Number(li.out_price) || 0);
      nameByCode.set(code, li.name || code);
    });

    const bucket = new Map<string, SoldItemProfitRow>();

    invoices.forEach((inv) => {
      const items = Array.isArray(inv.items) ? inv.items : [];
      const grossTotal = items.reduce(
        (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        0
      );
      const invoiceDiscount = Math.max(0, Number(inv.discount) || 0);

      items.forEach((it) => {
        const code = String(it.item_code || '').trim();
        if (!code) return;

        const qty = Number(it.quantity) || 0;
        const unitPrice = Number(it.unit_price) || 0;
        const gross = qty * unitPrice;
        const discountShare = grossTotal > 0 ? (invoiceDiscount * gross) / grossTotal : 0;
        const net = Math.max(0, gross - discountShare);
        const outPrice = costByCode.get(code) ?? 0;
        const cost = qty * outPrice;

        const existing = bucket.get(code) || {
          item_code: code,
          item_name: it.item_name || nameByCode.get(code) || code,
          sold_qty: 0,
          avg_unit_price: 0,
          gross_sales: 0,
          discount_allocated: 0,
          net_sales: 0,
          out_price: outPrice,
          cost_value: 0,
          profit: 0,
        };

        existing.sold_qty += qty;
        existing.gross_sales += gross;
        existing.discount_allocated += discountShare;
        existing.net_sales += net;
        existing.cost_value += cost;
        existing.profit += net - cost;
        existing.out_price = outPrice;

        bucket.set(code, existing);
      });
    });

    const rows = Array.from(bucket.values())
      .map((row) => ({
        ...row,
        avg_unit_price: row.sold_qty > 0 ? row.gross_sales / row.sold_qty : 0,
      }))
      .sort((a, b) => b.net_sales - a.net_sales);

    const totals = rows.reduce(
      (acc, row) => {
        acc.gross += row.gross_sales;
        acc.discount += row.discount_allocated;
        acc.net += row.net_sales;
        acc.cost += row.cost_value;
        acc.profit += row.profit;
        return acc;
      },
      { gross: 0, discount: 0, net: 0, cost: 0, profit: 0 }
    );

    return { rows, totals };
  };

  const handleViewDetails = async (loadId: number) => {
    try {
      setShowDetailsModal(true);
      setDetailsLoading(true);
      setSelectedLoadDetails(null);
      setSelectedLoadItems([]);
      setSoldItemProfitRows([]);
      setLoadInvoices([]);
      setLoadPayments([]);
      setLoadExpenses([]);
      setDeliverySummary(null);
      setExpenseError('');
      setExpenseSuccess('');
      setExpenseForm({
        date: new Date().toISOString().split('T')[0],
        category: 'fuel',
        amount: '',
        note: ''
      });

      const [loadRes, itemsRes, summaryRes, invoicesRes, paymentsRes] = await Promise.all([
        axios.get(`/api/vehicle-loading/loads/${loadId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
        axios.get('/api/vehicle-loading/load-items', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: { load_id: loadId },
        }),
        axios.get(`/api/vehicle-loading/loads/${loadId}/delivery-summary`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => null),
        axios.get<DistributionInvoiceListResponse>('/api/distribution/invoices', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: { per_page: 1000 },
        }).catch(() => null),
        axios.get<DistributionPaymentListResponse>('/api/distribution/payments', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: { per_page: 1000 },
        }).catch(() => null),
      ]);

      setSelectedLoadDetails(loadRes.data);
      const loadItems = Array.isArray(itemsRes.data) ? itemsRes.data : [];
      setSelectedLoadItems(loadItems);

      const allInvoices = invoicesRes?.data?.data?.data || [];
      const loadInvoices = allInvoices.filter((inv) => Number(inv.load_id) === Number(loadId));
      setLoadInvoices(loadInvoices);

      const allPayments = paymentsRes?.data?.data?.data || [];
      const loadPayments = allPayments.filter((pay) => Number(pay.load_id) === Number(loadId));
      setLoadPayments(loadPayments);

      const soldProfit = computeSoldItemsProfit(loadItems, loadInvoices);
      setSoldItemProfitRows(soldProfit.rows);
      await refreshDeliveryCashForLoad(loadId);

      if (summaryRes && summaryRes.data && summaryRes.data.data) {
        setDeliverySummary(summaryRes.data.data as LoadDeliverySummary);
      }
    } catch (error) {
      console.error('Error fetching load details:', error);
      alert('Failed to load vehicle load details');
      setShowDetailsModal(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleAddLoadExpense = async () => {
    if (!selectedLoadDetails) return;

    const amount = Number(expenseForm.amount || 0);
    if (!expenseForm.date || Number.isNaN(amount) || amount <= 0) {
      setExpenseError('Enter a valid date and expense amount.');
      setExpenseSuccess('');
      return;
    }

    if (amount > deliveryCashBalance) {
      setExpenseError('Insufficient delivery cash balance for this expense.');
      setExpenseSuccess('');
      return;
    }

    const trimmedNote = expenseForm.note.trim();
    const payloadNote = trimmedNote || `Payment for ${expenseForm.category.replace('_', ' ')}`;

    try {
      setExpenseSaving(true);
      setExpenseError('');
      setExpenseSuccess('');

      await axios.post(`/api/vehicle-loading/loads/${selectedLoadDetails.id}/expenses`, {
        expense_date: expenseForm.date,
        expense_type: expenseForm.category,
        amount,
        reference: `LDEX-${selectedLoadDetails.id}-${Date.now()}`,
        note: payloadNote,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      await refreshDeliveryCashForLoad(selectedLoadDetails.id);
      setExpenseForm((prev) => ({
        ...prev,
        amount: '',
        note: ''
      }));
      setExpenseSuccess('Load expense recorded and deducted from delivery cash account.');
    } catch (error) {
      console.error('Error adding load expense:', error);
      setExpenseError('Failed to record load expense.');
      setExpenseSuccess('');
    } finally {
      setExpenseSaving(false);
    }
  };

  const handlePrintDetails = () => {
    if (!selectedLoadDetails) return;

    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) {
      alert('Unable to open print window. Please allow popups.');
      return;
    }

    const rows = selectedLoadItems
      .map((item) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${item.product_code}</td>
          <td style="padding:8px;border:1px solid #ddd;">${item.name}</td>
          <td style="padding:8px;border:1px solid #ddd;">${item.type}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${Number(item.qty).toFixed(2)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${Number(item.sell_price).toFixed(2)}</td>
        </tr>
      `)
      .join('');

    win.document.write(`
      <html>
        <head>
          <title>Load ${selectedLoadDetails.load_number}</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
          <h2 style="margin-bottom: 6px;">Vehicle Load Details</h2>
          <p style="margin: 2px 0;"><strong>Load Number:</strong> ${selectedLoadDetails.load_number}</p>
          <p style="margin: 2px 0;"><strong>Status:</strong> ${selectedLoadDetails.status.replace('_', ' ')}</p>
          <p style="margin: 2px 0;"><strong>Load Date:</strong> ${new Date(selectedLoadDetails.load_date).toLocaleDateString()}</p>
          <p style="margin: 2px 0;"><strong>Delivery Date:</strong> ${selectedLoadDetails.delivery_date ? new Date(selectedLoadDetails.delivery_date).toLocaleDateString() : '-'}</p>
          <p style="margin: 2px 0;"><strong>Vehicle:</strong> ${selectedLoadDetails.vehicle?.registration_number || '-'} (${selectedLoadDetails.vehicle?.type || '-'})</p>
          <p style="margin: 2px 0;"><strong>Driver:</strong> ${selectedLoadDetails.driver?.name || '-'}</p>
          <p style="margin: 2px 0;"><strong>Sales Ref:</strong> ${selectedLoadDetails.sales_ref?.name || `${selectedLoadDetails.sales_ref?.first_name || ''} ${selectedLoadDetails.sales_ref?.last_name || ''}`.trim() || '-'}</p>
          <p style="margin: 2px 0;"><strong>Route:</strong> ${selectedLoadDetails.route?.name || '-'} (${selectedLoadDetails.route?.origin || '-'} → ${selectedLoadDetails.route?.destination || '-'})</p>
          <p style="margin: 2px 0;"><strong>Total Weight:</strong> ${Number(selectedLoadDetails.total_weight).toFixed(2)} kg</p>
          <p style="margin: 2px 0;"><strong>Notes:</strong> ${selectedLoadDetails.notes || '-'}</p>

          <h3 style="margin-top: 16px;">Load Items</h3>
          <table style="margin-top: 8px; width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="padding:8px;border:1px solid #ddd;text-align:left;">Product Code</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:left;">Name</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:left;">Type</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:right;">Qty</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:right;">Sell Price</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5" style="padding:8px;border:1px solid #ddd;text-align:center;">No items found</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);

    win.document.close();
    win.focus();
    win.print();
  };

  const handleDownloadDetails = () => {
    if (!selectedLoadDetails) return;

    const header = [
      'Load Number',
      'Status',
      'Load Date',
      'Delivery Date',
      'Vehicle',
      'Driver',
      'Sales Ref',
      'Route',
      'Total Weight (kg)',
      'Product Code',
      'Item Name',
      'Type',
      'Qty',
      'Sell Price',
      'Notes',
    ];

    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const common = [
      selectedLoadDetails.load_number,
      selectedLoadDetails.status,
      selectedLoadDetails.load_date,
      selectedLoadDetails.delivery_date || '',
      selectedLoadDetails.vehicle?.registration_number || '',
      selectedLoadDetails.driver?.name || '',
      selectedLoadDetails.sales_ref?.name || `${selectedLoadDetails.sales_ref?.first_name || ''} ${selectedLoadDetails.sales_ref?.last_name || ''}`.trim(),
      selectedLoadDetails.route?.name || '',
      Number(selectedLoadDetails.total_weight).toFixed(2),
    ];

    const rows = selectedLoadItems.length > 0
      ? selectedLoadItems.map((item) => [
          ...common,
          item.product_code,
          item.name,
          item.type,
          Number(item.qty).toFixed(2),
          Number(item.sell_price).toFixed(2),
          selectedLoadDetails.notes || '',
        ])
      : [[...common, '', '', '', '', '', selectedLoadDetails.notes || '']];

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => escapeCsv(String(cell))).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedLoadDetails.load_number}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'border border-amber-200 bg-amber-100 text-amber-700';
      case 'in_transit': return 'border border-blue-200 bg-blue-100 text-blue-700';
      case 'delivered': return 'border border-emerald-200 bg-emerald-100 text-emerald-700';
      case 'cancelled': return 'border border-rose-200 bg-rose-100 text-rose-700';
      default: return 'border border-slate-200 bg-slate-100 text-slate-700';
    }
  };

  const modalInputClass = 'w-full rounded-xl border border-emerald-200/80 bg-white/90 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100';
  const modalInputReadonlyClass = 'w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600 shadow-sm cursor-not-allowed';
  const modalSectionClass = 'rounded-2xl border border-white/70 bg-gradient-to-br from-white to-emerald-50/45 p-4 shadow-sm';
  const modalLabelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';
  const detailsCardClass = 'rounded-xl border border-white/70 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm';
  const detailsTableWrapClass = 'overflow-x-auto rounded-2xl border border-white/70 bg-white/95 shadow-sm';

  const filteredLoads = useMemo(() => {
    return loads.filter((load) => {
      const haystack = `${load.load_number} ${load.vehicle?.registration_number || ''} ${load.driver?.name || ''} ${load.route?.name || ''} ${load.notes || ''}`.toLowerCase();
      const matchesSearch = haystack.includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || load.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [loads, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLoads.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedLoads = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLoads.slice(start, start + PAGE_SIZE);
  }, [filteredLoads, currentPage]);

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

  const rowStart = filteredLoads.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rowEnd = Math.min(currentPage * PAGE_SIZE, filteredLoads.length);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_100%)]">
        <div className="h-14 w-14 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_55%,_#f8fafc_100%)]" />

      <section className="rounded-[28px] border border-white/70 bg-white/85 px-6 py-6 shadow-[0_26px_90px_-45px_rgba(16,185,129,0.5)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Loads Management</h1>
            <p className="mt-1 text-sm text-slate-600">Plan, track, and review vehicle loads with delivery status visibility.</p>
          </div>
          <button
            onClick={() => {
              setEditingLoad(null);
              resetForm();
              setFormData((prev) => ({ ...prev, load_number: generateLoadNumber() }));
              setShowModal(true);
            }}
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700"
          >
            Add New Load
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/60 bg-white/90 p-5 shadow-[0_18px_65px_-35px_rgba(30,64,175,0.45)] backdrop-blur-lg">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search Loads</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by load no, vehicle, driver, route or notes"
              className="w-full rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/40 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status Filter</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | Load['status'])}
              className="w-full rounded-xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="in_transit">In Transit</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-[0_18px_65px_-35px_rgba(16,185,129,0.45)] backdrop-blur-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Load Preview Table</h2>
          <div className="text-sm text-slate-600">Showing {rowStart} to {rowEnd} of {filteredLoads.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-100/80">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Load Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Vehicle
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Driver
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Route
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Weight (kg)
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {paginatedLoads.map((load) => (
                <tr key={load.id} className="transition hover:bg-emerald-50/35">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                    {load.load_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {load.vehicle?.registration_number || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {load.driver?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {load.route?.name || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getStatusColor(load.status)}`}>
                      {load.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {load.total_weight.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleViewDetails(load.id)}
                      className="text-green-600 hover:text-green-900 mr-4"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleViewDetails(load.id)}
                      className="text-cyan-600 hover:text-cyan-900 mr-4"
                    >
                      Expense
                    </button>
                    {load.status !== 'delivered' && load.status !== 'cancelled' && (
                      <button
                        onClick={() => setConfirmAction({ type: 'complete', load })}
                        className="text-emerald-600 hover:text-emerald-900 mr-4"
                      >
                        Complete
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(load)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmAction({ type: 'delete', load })}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {paginatedLoads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center">
                    <div className="text-base font-medium text-slate-800">No Loads Found</div>
                    <p className="mt-1 text-sm text-slate-500">
                      {searchTerm || statusFilter !== 'all'
                        ? 'Try adjusting your search or filter criteria.'
                        : 'Add your first load to get started.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">Page {currentPage} of {totalPages}</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
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
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Pending Loads</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{loads.filter((load) => load.status === 'pending').length}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">In Transit</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{loads.filter((load) => load.status === 'in_transit').length}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Delivered</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{loads.filter((load) => load.status === 'delivered').length}</p>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Total Weight</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {loads.reduce((sum, load) => sum + Number(load.total_weight || 0), 0).toFixed(2)} kg
          </p>
        </div>
      </section>

      {showDetailsModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-7xl">
            <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/90 shadow-[0_30px_120px_-50px_rgba(16,185,129,0.55)] backdrop-blur-xl">
            <div className="mt-0">
              <div className="flex items-start justify-between border-b border-white/70 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-6 py-5 text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Route Intelligence</p>
                  <h3 className="mt-1 text-2xl font-bold">Vehicle Load Details</h3>
                  <p className="mt-1 text-sm text-emerald-50/90">Review operational, payment, and profitability data in one consolidated view.</p>
                </div>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setSelectedLoadDetails(null);
                    setSelectedLoadItems([]);
                    setSoldItemProfitRows([]);
                    setLoadInvoices([]);
                    setLoadPayments([]);
                    setLoadExpenses([]);
                    setExpenseError('');
                    setExpenseSuccess('');
                  }}
                  className="rounded-full border border-white/40 bg-white/20 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/30"
                >
                  Close
                </button>
              </div>

              {detailsLoading ? (
                <div className="py-12 text-center text-slate-600">Loading details...</div>
              ) : !selectedLoadDetails ? (
                <div className="py-12 text-center text-slate-600">No details found.</div>
              ) : (
                <div className="space-y-6 px-6 py-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Load Number</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedLoadDetails.load_number}</p>
                    </div>
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedLoadDetails.status.replace('_', ' ')}</p>
                    </div>
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Load Date</p>
                      <p className="text-sm font-semibold text-slate-900">{new Date(selectedLoadDetails.load_date).toLocaleDateString()}</p>
                    </div>
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Delivery Date</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {selectedLoadDetails.delivery_date ? new Date(selectedLoadDetails.delivery_date).toLocaleDateString() : '-'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Vehicle</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {selectedLoadDetails.vehicle?.registration_number || '-'} ({selectedLoadDetails.vehicle?.type || '-'})
                      </p>
                    </div>
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Driver</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedLoadDetails.driver?.name || '-'}</p>
                    </div>
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Sales Ref</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {selectedLoadDetails.sales_ref?.name || `${selectedLoadDetails.sales_ref?.first_name || ''} ${selectedLoadDetails.sales_ref?.last_name || ''}`.trim() || '-'}
                      </p>
                    </div>
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Route</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {selectedLoadDetails.route?.name || '-'} ({selectedLoadDetails.route?.origin || '-'} → {selectedLoadDetails.route?.destination || '-'})
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Total Weight</p>
                      <p className="text-sm font-semibold text-slate-900">{Number(selectedLoadDetails.total_weight).toFixed(2)} kg</p>
                    </div>
                    <div className={detailsCardClass}>
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Total Items</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedLoadItems.length}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/70 bg-white/80 p-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-500 mb-1">Notes</p>
                    <p className="text-sm text-slate-700">{selectedLoadDetails.notes || '-'}</p>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50/40 p-4 shadow-sm">
                    <div className="flex flex-col gap-2 border-b border-blue-100 pb-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">Load Expenses</p>
                        <h4 className="text-base font-semibold text-blue-900">Fuel and Trip Expenses</h4>
                      </div>
                      <div className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                        Delivery Cash Balance: {deliveryCashBalance.toFixed(2)}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Date</label>
                        <input
                          type="date"
                          value={expenseForm.date}
                          onChange={(e) => setExpenseForm((prev) => ({ ...prev, date: e.target.value }))}
                          className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Category</label>
                        <select
                          value={expenseForm.category}
                          onChange={(e) => setExpenseForm((prev) => ({ ...prev, category: e.target.value }))}
                          className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        >
                          <option value="fuel">Fuel</option>
                          <option value="toll">Toll</option>
                          <option value="driver_allowance">Driver Allowance</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Amount</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={expenseForm.amount}
                          onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))}
                          placeholder="0.00"
                          className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Note</label>
                        <input
                          type="text"
                          value={expenseForm.note}
                          onChange={(e) => setExpenseForm((prev) => ({ ...prev, note: e.target.value }))}
                          placeholder="Fuel refill, toll gate, etc."
                          className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="text-xs text-blue-700">
                        Posting this expense creates an <span className="font-semibold">out</span> transaction in Delivery Cash.
                      </div>
                      <button
                        type="button"
                        onClick={handleAddLoadExpense}
                        disabled={expenseSaving}
                        className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-blue-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {expenseSaving ? 'Saving...' : 'Add Expense'}
                      </button>
                    </div>

                    {expenseError && (
                      <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                        {expenseError}
                      </div>
                    )}
                    {expenseSuccess && (
                      <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                        {expenseSuccess}
                      </div>
                    )}

                    <div className="mt-4 overflow-x-auto rounded-xl border border-blue-100 bg-white">
                      <table className="min-w-full divide-y divide-blue-100 text-xs">
                        <thead className="bg-blue-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-blue-700 uppercase">Date</th>
                            <th className="px-3 py-2 text-left font-medium text-blue-700 uppercase">Category</th>
                            <th className="px-3 py-2 text-left font-medium text-blue-700 uppercase">Reference</th>
                            <th className="px-3 py-2 text-left font-medium text-blue-700 uppercase">Note</th>
                            <th className="px-3 py-2 text-right font-medium text-blue-700 uppercase">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-50 bg-white">
                          {loadExpenses.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                                No expenses added for this load yet.
                              </td>
                            </tr>
                          ) : (
                            loadExpenses.map((expense) => (
                              <tr key={expense.id}>
                                <td className="px-3 py-2 text-slate-700">{new Date(expense.expense_date).toLocaleDateString()}</td>
                                <td className="px-3 py-2 text-slate-700">{formatExpenseCategory(expense.expense_type)}</td>
                                <td className="px-3 py-2 text-slate-700">{expense.reference || '-'}</td>
                                <td className="px-3 py-2 text-slate-700">{expense.note || '-'}</td>
                                <td className="px-3 py-2 text-right font-semibold text-rose-700">{Number(expense.amount || 0).toFixed(2)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                        {loadExpenses.length > 0 && (
                          <tfoot className="bg-blue-50">
                            <tr>
                              <td colSpan={4} className="px-3 py-2 text-right font-semibold text-blue-800">Total Expenses</td>
                              <td className="px-3 py-2 text-right font-semibold text-blue-900">
                                {loadExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {deliverySummary && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <h4 className="text-sm font-semibold text-emerald-900">Load Delivery Summary</h4>
                        <p className="text-xs text-emerald-800">
                          Period: {new Date(deliverySummary.period.from).toLocaleDateString()} – {new Date(deliverySummary.period.to).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-emerald-800 uppercase">Total Sale (Invoices)</p>
                          <p className="text-base font-semibold text-emerald-900">
                            {Number(deliverySummary.invoices.total_amount || 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-emerald-700">{deliverySummary.invoices.count} invoice(s)</p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-800 uppercase">Total Collected</p>
                          <p className="text-base font-semibold text-emerald-900">
                            {Number(deliverySummary.payments.total_collected || 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-emerald-700">
                            Cash: {Number(deliverySummary.payments.by_method?.cash?.total || 0).toFixed(2)} ·
                            {' '}Cheque: {Number(deliverySummary.payments.by_method?.check?.total || 0).toFixed(2)} ·
                            {' '}Bank: {Number(deliverySummary.payments.by_method?.bank_transfer?.total || 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-800 uppercase">Balance (Approx)</p>
                          <p className="text-base font-semibold text-emerald-900">
                            {(
                              Number(deliverySummary.invoices.total_amount || 0) -
                              Number(deliverySummary.payments.total_collected || 0)
                            ).toFixed(2)}
                          </p>
                          <p className="text-xs text-emerald-700">Total sale minus collected payments</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mt-3 border-t border-emerald-100 pt-3">
                        <div>
                          <p className="text-xs text-emerald-800 uppercase">Total Cost (Estimate)</p>
                          <p className="text-base font-semibold text-emerald-900">
                            {Number(
                              soldItemProfitRows.length > 0
                                ? soldProfitTotals.cost
                                : (deliverySummary.invoices.total_cost || 0)
                            ).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-800 uppercase">Total Profit (Estimate)</p>
                          <p className="text-base font-semibold text-emerald-900">
                            {Number(
                              soldItemProfitRows.length > 0
                                ? soldProfitTotals.profit
                                : (deliverySummary.invoices.total_profit || 0)
                            ).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-emerald-800 uppercase">Margin % (Approx)</p>
                          <p className="text-base font-semibold text-emerald-900">
                            {(soldItemProfitRows.length > 0
                              ? soldProfitTotals.net
                              : Number(deliverySummary.invoices.total_amount || 0)) > 0
                              ? ((
                                  (soldItemProfitRows.length > 0
                                    ? soldProfitTotals.profit
                                    : Number(deliverySummary.invoices.total_profit || 0)) /
                                  (soldItemProfitRows.length > 0
                                    ? soldProfitTotals.net
                                    : Number(deliverySummary.invoices.total_amount || 0))
                                ) * 100).toFixed(1)
                              : '0.0'}
                            %
                          </p>
                        </div>
                      </div>

                      {deliverySummary.payments.cheques.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-emerald-800 uppercase mb-1">Cheque Details</p>
                          <div className="overflow-x-auto border border-emerald-100 rounded-md bg-white">
                            <table className="min-w-full divide-y divide-emerald-100 text-xs">
                              <thead className="bg-emerald-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-emerald-800">Number</th>
                                  <th className="px-3 py-2 text-left font-medium text-emerald-800">Date</th>
                                  <th className="px-3 py-2 text-right font-medium text-emerald-800">Amount</th>
                                  <th className="px-3 py-2 text-left font-medium text-emerald-800">Bank</th>
                                  <th className="px-3 py-2 text-left font-medium text-emerald-800">Reference</th>
                                  <th className="px-3 py-2 text-left font-medium text-emerald-800">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-emerald-50">
                                {deliverySummary.payments.cheques.map((chq) => (
                                  <tr key={chq.id}>
                                    <td className="px-3 py-1 text-emerald-900">{chq.payment_number}</td>
                                    <td className="px-3 py-1 text-emerald-900">{new Date(chq.payment_date).toLocaleDateString()}</td>
                                    <td className="px-3 py-1 text-emerald-900 text-right">{Number(chq.amount).toFixed(2)}</td>
                                    <td className="px-3 py-1 text-emerald-900">{chq.bank_name || '-'}</td>
                                    <td className="px-3 py-1 text-emerald-900">{chq.reference_no || '-'}</td>
                                    <td className="px-3 py-1 text-emerald-900 capitalize">{chq.status}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={detailsTableWrapClass}>
                    <div className="px-4 pt-3 pb-1 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Collected Payment Details (By Load)</span>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Payment #</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Customer</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Invoice</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Method</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Reference</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Bank</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {loadPayments.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                              No collected payments found for this load.
                            </td>
                          </tr>
                        ) : (
                          loadPayments.map((pay) => (
                            <tr key={pay.id}>
                              <td className="px-4 py-2 text-gray-700">{pay.payment_number || `PAY-${pay.id}`}</td>
                              <td className="px-4 py-2 text-gray-700">
                                {pay.payment_date ? new Date(pay.payment_date).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-4 py-2 text-gray-700">
                                {pay.customer?.shop_name || (pay.customer_id ? `Customer #${pay.customer_id}` : '-')}
                              </td>
                              <td className="px-4 py-2 text-gray-700">{pay.invoice?.invoice_number || '-'}</td>
                              <td className="px-4 py-2 text-gray-700 capitalize">{(pay.payment_method || '-').replace('_', ' ')}</td>
                              <td className="px-4 py-2 text-gray-700">{pay.reference_no || '-'}</td>
                              <td className="px-4 py-2 text-gray-700">{pay.bank_name || '-'}</td>
                              <td className="px-4 py-2 text-gray-700 capitalize">{pay.status || '-'}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(pay.amount || 0).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {loadPayments.length > 0 && (
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td colSpan={8} className="px-4 py-2 text-right font-semibold text-gray-800">Total Collected</td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-900">
                              {loadPayments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0).toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  <div className={detailsTableWrapClass}>
                    <div className="px-4 pt-3 pb-1 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Customer Base Summary (By Load)</span>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Customer</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Invoices</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Total Sale</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Collected</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {customerBaseRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                              No customer base data found for this load.
                            </td>
                          </tr>
                        ) : (
                          customerBaseRows.map((row) => (
                            <tr key={row.customer_id}>
                              <td className="px-4 py-2 text-gray-700">
                                <div className="flex flex-col">
                                  <span>{row.customer_name}</span>
                                  <span className="text-[10px] text-gray-500">{row.customer_code}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right text-gray-700">{row.invoices_count}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.total_sale).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.collected).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-gray-800">{Number(row.balance).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {customerBaseRows.length > 0 && (
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td className="px-4 py-2 font-semibold text-gray-800">Total</td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              {customerBaseRows.reduce((sum, row) => sum + Number(row.invoices_count || 0), 0)}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">
                              {customerBaseRows.reduce((sum, row) => sum + Number(row.total_sale || 0), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">
                              {customerBaseRows.reduce((sum, row) => sum + Number(row.collected || 0), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-900">
                              {customerBaseRows.reduce((sum, row) => sum + Number(row.balance || 0), 0).toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {/* Loaded items table */}
                  <div className={detailsTableWrapClass}>
                    <div className="px-4 pt-3 pb-1 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Loaded Items (Truck)</span>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Code</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty (Current)</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sell Price</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedLoadItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No load items found.</td>
                          </tr>
                        ) : (
                          selectedLoadItems.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-2 text-sm text-gray-700">{item.product_code}</td>
                              <td className="px-4 py-2 text-sm text-gray-700">{item.name}</td>
                              <td className="px-4 py-2 text-sm text-gray-700">{item.type.replace('_', ' ')}</td>
                              <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(item.qty).toFixed(2)}</td>
                              <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(item.sell_price).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className={detailsTableWrapClass}>
                    <div className="px-4 pt-3 pb-1 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Sold Items & Profit (By Load)</span>
                    </div>
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Sold Qty</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Avg Sell</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Gross</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Discount</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Net Sale</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Out Price</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Cost</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase">Profit</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {soldItemProfitRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                              No sold item data found for this load.
                            </td>
                          </tr>
                        ) : (
                          soldItemProfitRows.map((row) => (
                            <tr key={row.item_code}>
                              <td className="px-4 py-2 text-gray-700">
                                <div className="flex flex-col">
                                  <span>{row.item_name}</span>
                                  <span className="text-[10px] text-gray-500">{row.item_code}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.sold_qty).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.avg_unit_price).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.gross_sales).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.discount_allocated).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.net_sales).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.out_price).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right text-gray-700">{Number(row.cost_value).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-semibold text-gray-800">{Number(row.profit).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {soldItemProfitRows.length > 0 && (
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td className="px-4 py-2 font-semibold text-gray-800">Total</td>
                            <td className="px-4 py-2 text-right text-gray-700">
                              {soldItemProfitRows.reduce((sum, row) => sum + Number(row.sold_qty || 0), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">
                              {soldItemProfitRows.reduce((sum, row) => sum + Number(row.gross_sales || 0), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">
                              {soldItemProfitRows.reduce((sum, row) => sum + Number(row.discount_allocated || 0), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">
                              {soldItemProfitRows.reduce((sum, row) => sum + Number(row.net_sales || 0), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">
                              {soldItemProfitRows.reduce((sum, row) => sum + Number(row.cost_value || 0), 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-900">
                              {soldItemProfitRows.reduce((sum, row) => sum + Number(row.profit || 0), 0).toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={handlePrintDetails}
                      className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadDetails}
                      className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-200/70 transition hover:from-blue-700 hover:to-cyan-700"
                    >
                      Download CSV
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-11/12 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              {confirmAction.type === 'complete' ? 'Complete Load' : 'Delete Load'}
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              {confirmAction.type === 'complete'
                ? `Mark load ${confirmAction.load.load_number} as delivered and end this route?`
                : `Are you sure you want to delete load ${confirmAction.load.load_number}? This action cannot be undone.`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={confirming}
                onClick={() => {
                  if (confirming) return;
                  setConfirmAction(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirming}
                onClick={async () => {
                  if (!confirmAction) return;
                  setConfirming(true);
                  try {
                    if (confirmAction.type === 'delete') {
                      await handleDelete(confirmAction.load.id);
                    } else {
                      await handleCompleteLoad(confirmAction.load);
                    }
                    setConfirmAction(null);
                  } finally {
                    setConfirming(false);
                  }
                }}
                className={`px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50 ${
                  confirmAction.type === 'complete' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirming ? 'Please wait...' : confirmAction.type === 'complete' ? 'Yes, Complete' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-5xl">
            <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/90 shadow-[0_30px_120px_-50px_rgba(16,185,129,0.55)] backdrop-blur-xl">
              <div className="flex items-start justify-between border-b border-white/70 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-6 py-5 text-white">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Load Planner</p>
                  <h3 className="mt-1 text-2xl font-bold">
                    {editingLoad ? 'Edit Load' : 'Create New Load'}
                  </h3>
                  <p className="mt-1 text-sm text-emerald-50/90">Assign fleet and route details for dispatch operations.</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingLoad(null);
                    resetForm();
                  }}
                  className="rounded-full border border-white/40 bg-white/20 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/30"
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleSubmit} className="max-h-[80vh] space-y-5 overflow-y-auto px-6 py-6">
                {/* Basic Information */}
                <div className={modalSectionClass}>
                  <h4 className="mb-4 text-base font-semibold text-slate-900">Basic Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={modalLabelClass}>Load Number</label>
                      <input
                        type="text"
                        value={formData.load_number}
                        readOnly
                        className={modalInputReadonlyClass}
                        placeholder="VL-2024-001"
                        required
                      />
                    </div>
                    <div>
                      <label className={modalLabelClass}>Load Date</label>
                      <input
                        type="date"
                        value={formData.load_date}
                        onChange={(e) => setFormData({ ...formData, load_date: e.target.value })}
                        className={modalInputClass}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Assignment Information */}
                <div className={modalSectionClass}>
                  <h4 className="mb-4 text-base font-semibold text-slate-900">Assignment</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={modalLabelClass}>Vehicle</label>
                      <select
                        value={formData.vehicle_id}
                        onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                        className={modalInputClass}
                        required
                      >
                        <option value="">Select Vehicle</option>
                        {Array.isArray(vehicles) && vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id.toString()}>
                            {vehicle.registration_number} - {vehicle.type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={modalLabelClass}>Driver</label>
                      <select
                        value={formData.driver_id}
                        onChange={(e) => setFormData({ ...formData, driver_id: e.target.value })}
                        className={modalInputClass}
                        required
                      >
                        <option value="">Select Driver</option>
                        {Array.isArray(drivers) && drivers.map((driver) => (
                          <option key={driver.id} value={driver.id.toString()}>
                            {driver.employee_code} - {driver.first_name} {driver.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={modalLabelClass}>Route</label>
                      <select
                        value={formData.route_id}
                        onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
                        className={modalInputClass}
                        required
                      >
                        <option value="">Select Route</option>
                        {Array.isArray(routes) && routes.map((route) => (
                          <option key={route.id} value={route.id.toString()}>
                            {route.name} - {route.origin} to {route.destination}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className={modalLabelClass}>Sales Ref</label>
                      <select
                        value={formData.sales_ref_id}
                        onChange={(e) => setFormData({ ...formData, sales_ref_id: e.target.value })}
                        className={modalInputClass}
                      >
                        <option value="">Select Sales Ref</option>
                        {Array.isArray(salesRefs) && salesRefs.map((salesRef) => (
                          <option key={salesRef.id} value={salesRef.id.toString()}>
                            {salesRef.employee_code} - {salesRef.first_name} {salesRef.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div className={modalSectionClass}>
                  <h4 className="mb-4 text-base font-semibold text-slate-900">Additional Information</h4>
                  <div>
                    <label className={modalLabelClass}>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={4}
                      className={modalInputClass}
                      placeholder="Enter any additional notes about this load..."
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-200/80 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingLoad(null);
                      resetForm();
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700"
                  >
                    {editingLoad ? 'Update Load' : 'Create Load'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}