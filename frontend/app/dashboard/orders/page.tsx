'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';
import DoReceiptPreview from './DoReceiptPreview';
import DeliveryOrdersTable from './DeliveryOrdersTable';

// "2026-11-22T00:00:00.000000Z" -> "22 Nov 2026". Uses the date part only, so it never shifts by timezone.
const formatLoadDate = (value?: string | null): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return '';
  const [, year, month, day] = match;
  const monthName = new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${day} ${monthName} ${year}`;
};

// "in_transit" -> "In transit"
const formatLoadStatus = (value?: string | null): string => {
  const text = String(value || '').replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
};

type SummaryRow = {
  outlet_id: number;
  outlet_name: string;
  outlet_code: string;
  total_sales: number;
  total_quantity: number;
  total_amount: number;
};

type SaleRow = {
  id: number;
  sale_number: string;
  do_number?: string | null;
  invoice_number?: string | null;
  order_type?: 'outlet_order' | 'factory_order' | null;
  status?: string | null;
  rejected_reason?: string | null;
  sale_date: string;
  customer_name?: string;
  notes?: string | null;
  payment_type?: string | null;
  paid_amount?: number;
  balance_amount?: number;
  discount_amount?: number;
  total_quantity: number;
  total_amount: number;
  outlet?: {
    id: number;
    name: string;
    code: string;
  };
  items?: Array<{
    id: number;
    order_id?: number;
    inventory_item_id?: number | null;
    item_code?: string;
    item_name: string;
    unit?: string;
    issue_type?: string;
    discount_amount?: number;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

type ApiError = {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
};

type LoadOption = {
  id: number;
  load_number?: string | null;
  load_date?: string | null;
  status?: string | null;
};

type DistributionCustomerOption = {
  id: number;
  customer_code?: string | null;
  shop_name?: string | null;
  owner_name?: string | null;
};

type InventoryOption = {
  id: number;
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  type?: 'raw_material' | 'finished_good' | null;
  current_stock?: number | string | null;
  sell_price?: number | string | null;
  unit_price?: number | string | null;
};

type CreateOrderLine = {
  row_id: string;
  inventory_item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  quantity: number;
};

type InvoiceEditLine = {
  row_id: string;
  source_item_id?: number;
  inventory_item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_type: 'amount' | 'percent';
  discount_value: number;
  discount_amount: number;
  line_total: number;
};

type CompanyBankAccountOption = {
  id: number;
  bank_name?: string | null;
  branch?: string | null;
  account_no?: string | null;
  current_balance?: number | string | null;
};

type CompanyOption = {
  id: number;
  name: string;
  bank_accounts?: CompanyBankAccountOption[];
};

const isHandledClientError = (error: ApiError): boolean => {
  const status = Number(error.response?.status || 0);
  return status >= 400 && status < 500;
};

export default function DashboardOrderListPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<SaleRow | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<SaleRow | null>(null);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [message, setMessage] = useState('');
  const [processingAction, setProcessingAction] = useState<'accept' | 'reject' | 'create-do' | 'create-invoice' | null>(null);
  const [showCreateDoModal, setShowCreateDoModal] = useState(false);
  const [doReceiptPreviewId, setDoReceiptPreviewId] = useState<number | null>(null);
  const [doListRefreshKey, setDoListRefreshKey] = useState(0);
  const [openingDoNumber, setOpeningDoNumber] = useState('');
  // DO flow: step 1 = load / delivery config, step 2 = editable preview before the DO is created.
  const [doStep, setDoStep] = useState<'config' | 'preview'>('config');
  const [doEditLines, setDoEditLines] = useState<InvoiceEditLine[]>([]);
  const [doOrderDiscount, setDoOrderDiscount] = useState('0');
  const [doOrderDiscountType, setDoOrderDiscountType] = useState<'amount' | 'percent'>('amount');
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [createOrderCustomerId, setCreateOrderCustomerId] = useState(0);
  const [createOrderCustomerName, setCreateOrderCustomerName] = useState('');
  const [createOrderNotes, setCreateOrderNotes] = useState('');
  const [createOrderCustomers, setCreateOrderCustomers] = useState<DistributionCustomerOption[]>([]);
  const [createOrderInventory, setCreateOrderInventory] = useState<InventoryOption[]>([]);
  const [createOrderLines, setCreateOrderLines] = useState<CreateOrderLine[]>([]);
  const [createOrderCustomerSearch, setCreateOrderCustomerSearch] = useState('');
  const [showCreateOrderCustomerSuggestions, setShowCreateOrderCustomerSuggestions] = useState(false);
  const [selectedCreateItemId, setSelectedCreateItemId] = useState(0);
  const [createOrderItemSearch, setCreateOrderItemSearch] = useState('');
  const [showCreateOrderItemSuggestions, setShowCreateOrderItemSuggestions] = useState(false);
  const [selectedCreateQty, setSelectedCreateQty] = useState('1');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [loadingCreateOrderMeta, setLoadingCreateOrderMeta] = useState(false);
  const [allocateLoadForDo, setAllocateLoadForDo] = useState(false);
  const [selectedDoLoadId, setSelectedDoLoadId] = useState(0);
  const [doDeliveryDate, setDoDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [doCallConfirmed, setDoCallConfirmed] = useState(false);
  const [loadOptions, setLoadOptions] = useState<LoadOption[]>([]);
  const [loadingLoadOptions, setLoadingLoadOptions] = useState(false);
  const [alertModalMessage, setAlertModalMessage] = useState('');
  const [showRejectReasonModal, setShowRejectReasonModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [recentOrdersPage, setRecentOrdersPage] = useState(1);
  const [recentOrderFilter, setRecentOrderFilter] = useState<'active' | 'rejected' | 'invoiced'>('active');
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [invoiceEditLines, setInvoiceEditLines] = useState<InvoiceEditLine[]>([]);
  const [invoiceOrderDiscountType, setInvoiceOrderDiscountType] = useState<'amount' | 'percent'>('amount');
  const [invoiceOrderDiscount, setInvoiceOrderDiscount] = useState('0');
  const [invoicePaidAmount, setInvoicePaidAmount] = useState('0');
  const [invoicePaymentType, setInvoicePaymentType] = useState<'cash' | 'bank' | 'card' | 'online' | 'cheque'>('cash');
  const [invoiceBankAccounts, setInvoiceBankAccounts] = useState<CompanyBankAccountOption[]>([]);
  const [invoiceBankAccountId, setInvoiceBankAccountId] = useState('');
  const [invoiceChequeNumber, setInvoiceChequeNumber] = useState('');
  const [invoiceChequeDate, setInvoiceChequeDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceChequeBankName, setInvoiceChequeBankName] = useState('');
  const [loadingInvoicePaymentOptions, setLoadingInvoicePaymentOptions] = useState(false);
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

  const loadData = useCallback(async (authToken: string) => {
    try {
      setLoading(true);
      setMessage('');

      const salesRes = await axios.get(`${API_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${authToken}` },
        params: {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          per_page: 100,
          orders_only: 1,
        },
      });

      const rows = Array.isArray(salesRes.data?.data?.data) ? salesRes.data.data.data : [];
      setSales(rows);
    } catch (error: unknown) {
      const apiError = error as ApiError;
      console.error('Error loading order tracking:', error);
      setMessage(apiError.response?.data?.message || 'Failed to load order tracking data.');
      setSales([]);
      if (apiError.response?.status === 401) {
        localStorage.removeItem('token');
        router.push('/');
      }
    } finally {
      setLoading(false);
    }
  }, [API_URL, fromDate, router, toDate]);

  useEffect(() => {
    if (token) {
      loadData(token);
    }
  }, [token, loadData]);

  useEffect(() => {
    if (!message) return;
    setAlertModalMessage(message);
    setMessage('');
  }, [message]);

  useEffect(() => {
    setRecentOrdersPage(1);
  }, [recentOrderFilter, sales]);

  const isPendingOrderRow = useCallback((row: SaleRow) => {
    const status = String(row.status || '').toLowerCase();
    return status !== 'rejected' && !row.invoice_number && status !== 'invoiced' && status !== 'completed';
  }, []);

  const summary = useMemo<SummaryRow[]>(() => {
    const grouped = new Map<number, SummaryRow>();

    sales.forEach((row) => {
      if (!isPendingOrderRow(row)) return;
      const outletId = Number(row.outlet?.id || 0);
      if (outletId <= 0) return;

      const existing = grouped.get(outletId) || {
        outlet_id: outletId,
        outlet_name: row.outlet?.name || '-',
        outlet_code: row.outlet?.code || '-',
        total_sales: 0,
        total_quantity: 0,
        total_amount: 0,
      };

      existing.total_sales += 1;
      existing.total_quantity += Number(row.total_quantity || 0);
      existing.total_amount += Number(row.total_amount || 0);
      grouped.set(outletId, existing);
    });

    return Array.from(grouped.values()).sort((a, b) => a.outlet_code.localeCompare(b.outlet_code));
  }, [isPendingOrderRow, sales]);

  const grandTotal = summary.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const grandCount = summary.reduce((sum, row) => sum + Number(row.total_sales || 0), 0);
  const grandQty = summary.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0);
  const averageTicket = grandCount > 0 ? grandTotal / grandCount : 0;
  const recentOrderRows = useMemo(() => {
    return sales.filter((row) => {
      const status = String(row.status || '').toLowerCase();
      if (recentOrderFilter === 'rejected') {
        return status === 'rejected';
      }
      if (recentOrderFilter === 'invoiced') {
        return Boolean(row.invoice_number) || status === 'invoiced' || status === 'completed';
      }
      return isPendingOrderRow(row);
    });
  }, [isPendingOrderRow, recentOrderFilter, sales]);
  const recentOrdersPageSize = 10;
  const recentOrdersTotalPages = Math.max(1, Math.ceil(recentOrderRows.length / recentOrdersPageSize));
  const safeRecentOrdersPage = Math.min(recentOrdersPage, recentOrdersTotalPages);
  const recentOrdersStart = (safeRecentOrdersPage - 1) * recentOrdersPageSize;
  const recentOrdersEnd = Math.min(recentOrdersStart + recentOrdersPageSize, recentOrderRows.length);
  const paginatedRecentOrderRows = recentOrderRows.slice(recentOrdersStart, recentOrdersStart + recentOrdersPageSize);
  const createOrderTotalQty = createOrderLines.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const invoiceEditSubtotal = invoiceEditLines.reduce((sum, row) => sum + Number(row.line_total || 0), 0);
  const doEditSubtotal = doEditLines.reduce((sum, row) => sum + Number(row.line_total || 0), 0);
  const doEditOrderDiscountAmount = (() => {
    const raw = Math.max(Number(doOrderDiscount || 0), 0);
    if (!Number.isFinite(raw)) return 0;
    const amount = doOrderDiscountType === 'percent' ? (doEditSubtotal * Math.min(raw, 100)) / 100 : raw;
    return Math.min(amount, doEditSubtotal);
  })();
  const doEditNetTotal = Math.max(doEditSubtotal - doEditOrderDiscountAmount, 0);
  const invoiceOrderDiscountAmount = useMemo(() => {
    const raw = Math.max(Number(invoiceOrderDiscount || 0), 0);
    if (invoiceOrderDiscountType === 'percent') {
      const pct = Math.min(raw, 100);
      return Math.min((invoiceEditSubtotal * pct) / 100, invoiceEditSubtotal);
    }
    return Math.min(raw, invoiceEditSubtotal);
  }, [invoiceEditSubtotal, invoiceOrderDiscount, invoiceOrderDiscountType]);
  const invoiceEditNetTotal = Math.max(invoiceEditSubtotal - invoiceOrderDiscountAmount, 0);
  const invoicePaidAmountValue = Math.max(Number(invoicePaidAmount || 0), 0);
  const invoiceBalanceAmount = Math.max(invoiceEditNetTotal - invoicePaidAmountValue, 0);
  const selectedInvoiceBankAccount = invoiceBankAccounts.find(
    (account) => String(account.id) === invoiceBankAccountId,
  );
  const filteredCreateOrderCustomers = useMemo(() => {
    const keyword = createOrderCustomerSearch.trim().toLowerCase();
    if (!keyword) return createOrderCustomers.slice(0, 20);
    return createOrderCustomers
      .filter((customer) => (
        `${customer.customer_code || ''} ${customer.shop_name || ''} ${customer.owner_name || ''}`
      ).toLowerCase().includes(keyword))
      .slice(0, 20);
  }, [createOrderCustomerSearch, createOrderCustomers]);
  const filteredCreateOrderItems = useMemo(() => {
    const keyword = createOrderItemSearch.trim().toLowerCase();
    const matches = keyword
      ? createOrderInventory.filter((item) => (`${item.code || ''} ${item.name || ''}`).toLowerCase().includes(keyword))
      : createOrderInventory;
    const inStockFirst = [...matches].sort((a, b) => Number(Number(b.current_stock || 0) > 0) - Number(Number(a.current_stock || 0) > 0));
    return inStockFirst.slice(0, 20);
  }, [createOrderInventory, createOrderItemSearch]);

  const createOrderStockById = useMemo(() => {
    const map = new Map<number, number>();
    createOrderInventory.forEach((item) => map.set(Number(item.id), Number(item.current_stock || 0)));
    return map;
  }, [createOrderInventory]);

  const updateOrderInState = useCallback((updatedOrder: SaleRow) => {
    setSales((prev) => prev.map((row) => (row.id === updatedOrder.id ? { ...row, ...updatedOrder } : row)));
    setSelectedOrder((prev) => (prev && prev.id === updatedOrder.id ? { ...prev, ...updatedOrder } : prev));
  }, []);

  const resetCreateOrderForm = useCallback(() => {
    setCreateOrderCustomerId(0);
    setCreateOrderCustomerName('');
    setCreateOrderCustomerSearch('');
    setShowCreateOrderCustomerSuggestions(false);
    setCreateOrderNotes('');
    setCreateOrderLines([]);
    setSelectedCreateItemId(0);
    setCreateOrderItemSearch('');
    setShowCreateOrderItemSuggestions(false);
    setSelectedCreateQty('1');
  }, []);

  const loadCreateOrderMeta = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingCreateOrderMeta(true);
      const [customerRes, inventoryRes] = await Promise.all([
        axios.get(`${API_URL}/api/distribution/customers`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 200, status: 'active' },
        }),
        // Orders are for finished products only; raw materials are excluded.
        axios.get(`${API_URL}/api/stock/inventory`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 200, status: 'active', type: 'finished_good' },
        }),
      ]);

      const customerRows = Array.isArray(customerRes.data?.data?.data) ? customerRes.data.data.data : [];
      const inventoryRows = (Array.isArray(inventoryRes.data?.data?.data) ? inventoryRes.data.data.data : [])
        .filter((item: InventoryOption) => !item.type || item.type === 'finished_good');
      setCreateOrderCustomers(customerRows);
      setCreateOrderInventory(inventoryRows);
    } catch (error) {
      console.error('Failed to load create-order metadata:', error);
      setCreateOrderCustomers([]);
      setCreateOrderInventory([]);
      setMessage('Failed to load customers/items for create order.');
    } finally {
      setLoadingCreateOrderMeta(false);
    }
  }, [API_URL, token]);

  const openCreateOrderModal = useCallback(() => {
    resetCreateOrderForm();
    setShowCreateOrderModal(true);
    void loadCreateOrderMeta();
  }, [loadCreateOrderMeta, resetCreateOrderForm]);

  const addCreateOrderItem = useCallback(() => {
    const selectedItem = createOrderInventory.find((item) => Number(item.id) === selectedCreateItemId);
    const qty = Number(selectedCreateQty || 0);

    if (!selectedItem) {
      setMessage('Please select an item.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage('Quantity must be greater than 0.');
      return;
    }

    const normalizedId = Number(selectedItem.id || 0);
    setCreateOrderLines((prev) => {
      const existing = prev.find((line) => line.inventory_item_id === normalizedId);
      if (existing) {
        return prev.map((line) => (
          line.inventory_item_id === normalizedId
            ? {
              ...line,
              quantity: Number(line.quantity || 0) + qty,
            }
            : line
        ));
      }

      return [
        ...prev,
        {
          row_id: `${normalizedId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          inventory_item_id: normalizedId,
          item_code: String(selectedItem.code || '-'),
          item_name: String(selectedItem.name || 'Item'),
          unit: String(selectedItem.unit || ''),
          quantity: qty,
        },
      ];
    });
    setSelectedCreateQty('1');
    setCreateOrderItemSearch('');
    setSelectedCreateItemId(0);
    setShowCreateOrderItemSuggestions(false);
  }, [createOrderInventory, selectedCreateItemId, selectedCreateQty]);

  const selectCreateOrderCustomer = useCallback((customer: DistributionCustomerOption) => {
    const customerId = Number(customer.id || 0);
    const customerLabel = `${customer.customer_code || '-'} - ${customer.shop_name || customer.owner_name || 'Customer'}`;
    const customerName = String(customer.shop_name || customer.owner_name || '').trim();
    setCreateOrderCustomerId(customerId);
    setCreateOrderCustomerSearch(customerLabel);
    setCreateOrderCustomerName(customerName);
    setShowCreateOrderCustomerSuggestions(false);
  }, []);

  const selectCreateOrderItem = useCallback((item: InventoryOption) => {
    const itemId = Number(item.id || 0);
    setSelectedCreateItemId(itemId);
    setCreateOrderItemSearch(`${item.code || '-'} - ${item.name || 'Item'}`);
    setShowCreateOrderItemSuggestions(false);
  }, []);

  const removeCreateOrderItem = useCallback((rowId: string) => {
    setCreateOrderLines((prev) => prev.filter((line) => line.row_id !== rowId));
  }, []);

  const submitCreateOrder = useCallback(async () => {
    if (!token) return;
    if (createOrderLines.length === 0) {
      setMessage('Please add at least one item.');
      return;
    }

    const selectedCustomer = createOrderCustomers.find((row) => Number(row.id) === createOrderCustomerId);
    const customerName = createOrderCustomerName.trim() || String(selectedCustomer?.shop_name || selectedCustomer?.owner_name || '').trim();
    if (!customerName) {
      setMessage('Please choose or enter customer name.');
      return;
    }

    try {
      setCreatingOrder(true);
      const res = await axios.post(
        `${API_URL}/api/orders`,
        {
          sale_mode: 'get_order',
          order_type: 'factory_order',
          sale_date: new Date().toISOString(),
          customer_name: customerName,
          distribution_customer_id: createOrderCustomerId > 0 ? createOrderCustomerId : null,
          discount_amount: 0,
          paid_amount: 0,
          payment_type: 'cash',
          notes: createOrderNotes || null,
          items: createOrderLines.map((line) => ({
            inventory_item_id: line.inventory_item_id,
            quantity: line.quantity,
            issue_type: 'retail',
            discount_amount: 0,
          })),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const createdOrder = res.data?.data as SaleRow | undefined;
      if (createdOrder) {
        setSales((prev) => [createdOrder, ...prev.filter((row) => row.id !== createdOrder.id)]);
        setSelectedOrder(createdOrder);
      } else {
        await loadData(token);
      }
      setShowCreateOrderModal(false);
      resetCreateOrderForm();
      setMessage(res.data?.message || 'Order created successfully.');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.message || 'Failed to create order.';
      if (isHandledClientError(apiError)) {
        console.warn('Create order blocked:', errorMessage);
      } else {
        console.error('Create order failed:', error);
      }
      setMessage(errorMessage);
    } finally {
      setCreatingOrder(false);
    }
  }, [API_URL, createOrderCustomerId, createOrderCustomerName, createOrderCustomers, createOrderLines, createOrderNotes, loadData, resetCreateOrderForm, token]);

  const loadVehicleLoads = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingLoadOptions(true);
      const res = await axios.get(`${API_URL}/api/vehicle-loading/loads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rows: LoadOption[] = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.data) ? res.data.data : []);
      setLoadOptions(
        rows.filter((row) => String(row.status || '').toLowerCase() === 'in_transit')
      );
    } catch (error: unknown) {
      const apiError = error as ApiError;
      if (isHandledClientError(apiError)) {
        console.warn('Failed to load vehicle loads:', apiError.response?.data?.message || 'Request failed');
      } else {
        console.error('Failed to load vehicle loads:', error);
      }
      setLoadOptions([]);
    } finally {
      setLoadingLoadOptions(false);
    }
  }, [API_URL, token]);

  // Opens the on-screen DO receipt (54mm / 80mm / A4) instead of downloading a PDF.
  const downloadDoReceipt = useCallback(async (distributionDoId: number) => {
    if (!token || distributionDoId <= 0) return;
    setDoReceiptPreviewId(distributionDoId);
  }, [token]);

  const downloadInvoiceReceipt = useCallback(async (distributionInvoiceId: number) => {
    if (!token || distributionInvoiceId <= 0) return;
    try {
      const response = await axios.get(`${API_URL}/api/distribution/invoices/${distributionInvoiceId}/receipt`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-receipt-${distributionInvoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate invoice receipt:', error);
      setMessage('Invoice created, but report generation failed.');
    }
  }, [API_URL, token]);

  const handleOrderAction = useCallback(async (
    action: 'accept' | 'reject' | 'create-do' | 'create-invoice',
    extraPayload?: Record<string, unknown>,
  ) => {
    if (!token || !selectedOrder) {
      return false;
    }

    let payload: Record<string, unknown> = {};
    if (action === 'reject' && !extraPayload) {
      setRejectReason(selectedOrder.rejected_reason || '');
      setShowRejectReasonModal(true);
      return false;
    }
    if (action === 'reject') {
      if (extraPayload) {
        payload = extraPayload;
      } else {
        return false;
      }
    }
    if (action !== 'reject' && extraPayload) {
      payload = extraPayload;
    }
    if (extraPayload) {
      payload = { ...payload, ...extraPayload };
    }

    try {
      setProcessingAction(action);
      setMessage('');

      const endpointByAction = {
        accept: 'accept',
        reject: 'reject',
        'create-do': 'create-do',
        'create-invoice': 'create-invoice',
      } as const;

      const res = await axios.post(
        `${API_URL}/api/orders/${selectedOrder.id}/${endpointByAction[action]}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const updatedOrder = res.data?.data as SaleRow | undefined;
      if (updatedOrder) {
        updateOrderInState(updatedOrder);
      } else {
        await loadData(token);
      }
      if (action === 'create-do') {
        setDoListRefreshKey((prev) => prev + 1);
        const distributionDoId = Number(res.data?.distribution_do_id || 0);
        if (distributionDoId > 0) {
          await downloadDoReceipt(distributionDoId);
        }
      }
      if (action === 'create-invoice') {
        const distributionInvoiceId = Number(res.data?.distribution_invoice_id || 0);
        if (distributionInvoiceId > 0) {
          await downloadInvoiceReceipt(distributionInvoiceId);
        }
      }
      setMessage(res.data?.message || 'Order action completed successfully.');
      return true;
    } catch (error: unknown) {
      const apiError = error as ApiError;
      const errorMessage = apiError.response?.data?.message || 'Failed to process order action.';
      if (isHandledClientError(apiError)) {
        console.warn('Order action blocked:', errorMessage);
      } else {
        console.error('Order action failed:', error);
      }
      setMessage(errorMessage);
      return false;
    } finally {
      setProcessingAction(null);
    }
  }, [API_URL, downloadDoReceipt, downloadInvoiceReceipt, loadData, selectedOrder, token, updateOrderInState]);

  // Mirrors the backend rule: only untouched orders (no DO, invoice or payment) can be deleted.
  const canDeleteOrder = useCallback((row: SaleRow) => {
    const status = String(row.status || 'pending').toLowerCase();
    return ['pending', 'rejected'].includes(status)
      && !row.do_number
      && !row.invoice_number
      && Number(row.paid_amount || 0) <= 0;
  }, []);

  const confirmDeleteOrder = useCallback(async () => {
    if (!orderToDelete || !token) return;
    try {
      setDeletingOrder(true);
      const res = await axios.delete(`${API_URL}/api/orders/${orderToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (selectedOrder?.id === orderToDelete.id) setSelectedOrder(null);
      setOrderToDelete(null);
      await loadData(token);
      setMessage(res.data?.message || 'Order deleted successfully.');
    } catch (error: unknown) {
      const apiError = error as ApiError;
      setOrderToDelete(null);
      setMessage(apiError.response?.data?.message || 'Failed to delete order.');
    } finally {
      setDeletingOrder(false);
    }
  }, [API_URL, loadData, orderToDelete, selectedOrder, token]);

  const submitRejectOrder = useCallback(async () => {
    const ok = await handleOrderAction('reject', { reason: rejectReason.trim() });
    if (ok) {
      setShowRejectReasonModal(false);
      setRejectReason('');
    }
  }, [handleOrderAction, rejectReason]);

  const openDoByNumber = useCallback(async (doNumber: string) => {
    if (!token || !doNumber) return;
    try {
      setOpeningDoNumber(doNumber);
      const res = await axios.get(`${API_URL}/api/distribution/dos`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { q: doNumber, per_page: 5 },
      });
      const rows = (res.data?.data?.data || []) as Array<{ id: number; do_number: string }>;
      const match = rows.find((row) => row.do_number === doNumber);
      if (match) {
        setDoReceiptPreviewId(match.id);
      } else {
        setMessage(`Delivery order ${doNumber} was not found.`);
      }
    } catch {
      setMessage('Could not open the delivery order.');
    } finally {
      setOpeningDoNumber('');
    }
  }, [API_URL, token]);

  const openCreateDoModal = useCallback(() => {
    setDoDeliveryDate(new Date().toISOString().slice(0, 10));
    setAllocateLoadForDo(false);
    setSelectedDoLoadId(-1);
    setDoCallConfirmed(false);
    setDoStep('config');
    setShowCreateDoModal(true);
    void loadVehicleLoads();
  }, [loadVehicleLoads]);

  const openDoPreview = useCallback(() => {
    if (!selectedOrder) return;
    const sourceItems = (selectedOrder.items || []).filter((item) => Number(item.inventory_item_id || 0) > 0);
    if (sourceItems.length === 0) {
      setMessage('Order has no item lines to put on a DO.');
      return;
    }
    setDoEditLines(sourceItems.map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const discount = Math.min(Number(item.discount_amount || 0), unitPrice);
      return {
        row_id: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source_item_id: item.id,
        inventory_item_id: Number(item.inventory_item_id || 0),
        item_code: String(item.item_code || ''),
        item_name: String(item.item_name || ''),
        unit: String(item.unit || ''),
        quantity,
        unit_price: unitPrice,
        discount_type: 'amount',
        discount_value: discount,
        discount_amount: discount,
        line_total: quantity * Math.max(unitPrice - discount, 0),
      };
    }));
    setDoOrderDiscountType('amount');
    setDoOrderDiscount(String(Number(selectedOrder.discount_amount || 0)));
    setDoStep('preview');
  }, [selectedOrder]);

  const updateDoEditLine = useCallback((
    rowId: string,
    field: 'quantity' | 'unit_price' | 'discount_value' | 'discount_type',
    value: number | 'amount' | 'percent',
  ) => {
    setDoEditLines((prev) => prev.map((line) => {
      if (line.row_id !== rowId) return line;
      const next = { ...line } as InvoiceEditLine;
      if (field === 'discount_type') {
        next.discount_type = value as 'amount' | 'percent';
      } else {
        next[field] = Number.isFinite(Number(value)) ? Number(value) : 0;
      }
      const qty = Math.max(Number(next.quantity || 0), 0);
      const unitPrice = Math.max(Number(next.unit_price || 0), 0);
      const discountValue = Math.max(Number(next.discount_value || 0), 0);
      next.discount_amount = next.discount_type === 'percent'
        ? Math.min((unitPrice * Math.min(discountValue, 100)) / 100, unitPrice)
        : Math.min(discountValue, unitPrice);
      next.line_total = qty * Math.max(unitPrice - next.discount_amount, 0);
      return next;
    }));
  }, []);

  const submitCreateDo = useCallback(async () => {
    if (doEditLines.length === 0) {
      setMessage('Please keep at least one item on the DO.');
      return;
    }
    if (doEditLines.some((line) => !(Number(line.quantity) > 0))) {
      setMessage('Every DO line needs a quantity greater than 0.');
      return;
    }
    const ok = await handleOrderAction('create-do', {
      allocate_load: allocateLoadForDo && selectedDoLoadId > 0,
      load_id: allocateLoadForDo && selectedDoLoadId > 0 ? selectedDoLoadId : null,
      delivery_date: doDeliveryDate || null,
      call_confirmed: doCallConfirmed,
      order_discount_amount: Number(doEditOrderDiscountAmount.toFixed(2)),
      items: doEditLines.map((line) => ({
        inventory_item_id: line.inventory_item_id,
        item_code: line.item_code,
        item_name: line.item_name,
        unit: line.unit || null,
        quantity: Number(line.quantity || 0),
        unit_price: Number(line.unit_price || 0),
        discount_amount: Number(Number(line.discount_amount || 0).toFixed(2)),
      })),
    });
    if (ok) {
      setShowCreateDoModal(false);
      setDoStep('config');
    }
  }, [allocateLoadForDo, doCallConfirmed, doDeliveryDate, doEditLines, doEditOrderDiscountAmount, handleOrderAction, selectedDoLoadId]);

  const openCreateInvoiceModal = useCallback(() => {
    if (!selectedOrder) return;
    const sourceItems = (selectedOrder.items || []).filter((item) => Number(item.inventory_item_id || 0) > 0);
    if (sourceItems.length === 0) {
      setMessage('Order has no editable item lines to create invoice.');
      return;
    }
    const lines: InvoiceEditLine[] = sourceItems.map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const discount = Number(item.discount_amount || 0);
      const effectiveUnit = Math.max(unitPrice - discount, 0);
      return {
        row_id: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source_item_id: item.id,
        inventory_item_id: Number(item.inventory_item_id || 0),
        item_code: String(item.item_code || ''),
        item_name: String(item.item_name || ''),
        unit: String(item.unit || ''),
        quantity,
        unit_price: unitPrice,
        discount_type: 'amount',
        discount_value: discount,
        discount_amount: discount,
        line_total: quantity * effectiveUnit,
      };
    });
    setInvoiceEditLines(lines);
    setInvoiceOrderDiscountType('amount');
    setInvoiceOrderDiscount(String(Number(selectedOrder.discount_amount || 0)));
    setInvoicePaidAmount(String(Number(selectedOrder.paid_amount || 0)));
    setInvoicePaymentType((['cash', 'bank', 'card', 'online', 'cheque'].includes(String(selectedOrder.payment_type || 'cash'))
      ? String(selectedOrder.payment_type || 'cash')
      : 'cash') as 'cash' | 'bank' | 'card' | 'online' | 'cheque');
    setInvoiceBankAccountId('');
    setInvoiceChequeNumber('');
    setInvoiceChequeDate(new Date().toISOString().slice(0, 10));
    setInvoiceChequeBankName('');
    setShowCreateInvoiceModal(true);
    if (token) {
      setLoadingInvoicePaymentOptions(true);
      void axios.get<CompanyOption[]>(`${API_URL}/api/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((response) => {
        const companies = Array.isArray(response.data) ? response.data : [];
        setInvoiceBankAccounts(companies.flatMap((company) => company.bank_accounts || []));
      }).catch(() => {
        setInvoiceBankAccounts([]);
        setMessage('Unable to load company bank accounts.');
      }).finally(() => {
        setLoadingInvoicePaymentOptions(false);
      });
    }
  }, [API_URL, selectedOrder, token]);

  const updateInvoiceEditLine = useCallback((
    rowId: string,
    field: 'quantity' | 'unit_price' | 'discount_value' | 'discount_type',
    value: number | 'amount' | 'percent',
  ) => {
    setInvoiceEditLines((prev) => prev.map((line) => {
      if (line.row_id !== rowId) return line;
      const nextLine = { ...line } as InvoiceEditLine;
      if (field === 'discount_type') {
        nextLine.discount_type = value as 'amount' | 'percent';
      } else {
        nextLine[field] = Number.isFinite(Number(value)) ? Number(value) : 0;
      }
      const qty = Math.max(Number(nextLine.quantity || 0), 0);
      const unitPrice = Math.max(Number(nextLine.unit_price || 0), 0);
      const discountValue = Math.max(Number(nextLine.discount_value || 0), 0);
      const discount = nextLine.discount_type === 'percent'
        ? Math.min(unitPrice * Math.min(discountValue, 100) / 100, unitPrice)
        : Math.min(discountValue, unitPrice);
      nextLine.discount_amount = discount;
      nextLine.line_total = qty * Math.max(unitPrice - nextLine.discount_amount, 0);
      return nextLine;
    }));
  }, []);

  const submitCreateInvoiceWithEdit = useCallback(async () => {
    if (invoiceEditLines.length === 0) {
      setMessage('Please keep at least one item to create invoice.');
      return;
    }
    if (!Number.isFinite(Number(invoiceOrderDiscount || 0)) || Number(invoiceOrderDiscount || 0) < 0) {
      setMessage('Order discount must be 0 or greater.');
      return;
    }
    if (!Number.isFinite(Number(invoicePaidAmount || 0)) || Number(invoicePaidAmount || 0) < 0) {
      setMessage('Paid amount must be 0 or greater.');
      return;
    }
    if (invoicePaymentType === 'bank' && !invoiceBankAccountId) {
      setMessage('Please select the bank account receiving this transfer.');
      return;
    }
    if (invoicePaymentType === 'cheque' && (!invoiceChequeNumber.trim() || !invoiceChequeDate || !invoiceChequeBankName.trim())) {
      setMessage('Cheque number, cheque date, and cheque bank are required.');
      return;
    }

    const itemsPayload = invoiceEditLines.map((line) => ({
      id: line.source_item_id || null,
      inventory_item_id: line.inventory_item_id,
      item_code: line.item_code,
      item_name: line.item_name,
      unit: line.unit || null,
      quantity: Number(line.quantity || 0),
      unit_price: Number(line.unit_price || 0),
      discount_amount: Number(line.discount_amount || 0),
    }));

    const ok = await handleOrderAction('create-invoice', {
      edit_order: true,
      order_discount_amount: invoiceOrderDiscountAmount,
      invoice_paid_amount: invoicePaidAmountValue,
      invoice_payment_type: invoicePaymentType,
      invoice_bank_account_id: invoicePaymentType === 'bank' ? Number(invoiceBankAccountId) : null,
      invoice_cheque_number: invoicePaymentType === 'cheque' ? invoiceChequeNumber.trim() : null,
      invoice_cheque_date: invoicePaymentType === 'cheque' ? invoiceChequeDate : null,
      invoice_cheque_bank_name: invoicePaymentType === 'cheque' ? invoiceChequeBankName.trim() : null,
      items: itemsPayload,
    });
    if (ok) {
      setShowCreateInvoiceModal(false);
    }
  }, [handleOrderAction, invoiceBankAccountId, invoiceChequeBankName, invoiceChequeDate, invoiceChequeNumber, invoiceEditLines, invoiceOrderDiscount, invoiceOrderDiscountAmount, invoicePaidAmount, invoicePaidAmountValue, invoicePaymentType]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Order Collection</h1>
              <p className="text-xs text-gray-600">Common admin view for outlet and factory order collection</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 border border-rose-200 bg-rose-50 text-rose-700 rounded-md text-sm font-medium hover:bg-rose-100"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 w-full py-8 px-3 sm:px-4 lg:px-6 space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Filter Window</h2>
              <p className="text-sm text-gray-600">Control the period to analyze order collection movement across outlets.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(end.getDate() - 6);
                  setFromDate(start.toISOString().slice(0, 10));
                  setToDate(end.toISOString().slice(0, 10));
                }}
                className="px-3 py-1.5 text-xs rounded-md border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(end.getDate() - 29);
                  setFromDate(start.toISOString().slice(0, 10));
                  setToDate(end.toISOString().slice(0, 10));
                }}
                className="px-3 py-1.5 text-xs rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
              >
                Last 30 Days
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2 flex items-end gap-2">
              <button
                onClick={() => token && loadData(token)}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-md text-sm font-medium hover:from-blue-700 hover:to-indigo-700"
              >
                Apply Filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50"
              >
                Clear Dates
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Pending Order Count</div>
            <div className="text-2xl font-bold text-gray-900">{grandCount}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Pending Order Amount</div>
            <div className="text-2xl font-bold text-gray-900">{grandTotal.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Pending Order Quantity</div>
            <div className="text-2xl font-bold text-gray-900">{grandQty.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Outlets With Pending Orders</div>
            <div className="text-2xl font-bold text-gray-900">{summary.length}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Pending Avg Ticket</div>
            <div className="text-2xl font-bold text-gray-900">{averageTicket.toFixed(2)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-rose-50 to-pink-50 text-sm font-semibold text-gray-800">Outlet-wise Order Summary</div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Order Count</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">Loading...</td></tr>
                ) : summary.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">No order summary records found.</td></tr>
                ) : (
                  summary.map((row) => (
                    <tr key={row.outlet_id} className="hover:bg-rose-50/40 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-gray-800">
                        <div className="font-medium">{row.outlet_code} - {row.outlet_name}</div>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(row.total_sales || 0)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(row.total_quantity || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-semibold">{Number(row.total_amount || 0).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200/80 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-800">Recent Order Lines</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {recentOrderFilter === 'active' ? 'Rejected and invoiced orders are hidden by default.' : `Showing ${recentOrderFilter} orders.`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                  <span>View</span>
                  <select
                    value={recentOrderFilter}
                    onChange={(e) => setRecentOrderFilter(e.target.value as 'active' | 'rejected' | 'invoiced')}
                    className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="active">Active Orders</option>
                    <option value="rejected">Rejected Orders</option>
                    <option value="invoiced">Invoiced Orders</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={openCreateOrderModal}
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Create Order
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Remark</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">Loading...</td></tr>
                ) : recentOrderRows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">No {recentOrderFilter} order records found.</td></tr>
                ) : (
                  paginatedRecentOrderRows.map((row) => (
                    <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-gray-800 font-medium">{row.do_number || row.sale_number}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{row.outlet?.code || '-'} - {row.outlet?.name || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{new Date(row.sale_date).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{row.customer_name || '-'}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">
                        {row.order_type === 'factory_order' ? 'Factory Order' : 'Outlet Order'}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                          String(row.status || '').toLowerCase() === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : (Boolean(row.invoice_number) || ['invoiced', 'completed'].includes(String(row.status || '').toLowerCase()))
                              ? 'bg-violet-100 text-violet-700'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {Boolean(row.invoice_number) || ['invoiced', 'completed'].includes(String(row.status || '').toLowerCase())
                            ? 'Invoiced'
                            : (String(row.status || 'pending').replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-700">{Number(row.total_quantity || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-900 font-semibold">{Number(row.total_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(row)}
                            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            View
                          </button>
                          {canDeleteOrder(row) ? (
                            <button
                              type="button"
                              onClick={() => setOrderToDelete(row)}
                              className="rounded-md border border-rose-200 bg-white px-2 py-1.5 text-rose-600 hover:bg-rose-50"
                              title="Delete order"
                              aria-label={`Delete order ${row.sale_number}`}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></svg>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && recentOrderRows.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white px-4 py-3 text-sm">
              <div className="text-gray-600">
                Showing {recentOrdersStart + 1}-{recentOrdersEnd} of {recentOrderRows.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRecentOrdersPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeRecentOrdersPage <= 1}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-600">
                  Page {safeRecentOrdersPage} / {recentOrdersTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setRecentOrdersPage((prev) => Math.min(recentOrdersTotalPages, prev + 1))}
                  disabled={safeRecentOrdersPage >= recentOrdersTotalPages}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>

        <DeliveryOrdersTable
          token={token}
          apiUrl={API_URL}
          refreshKey={doListRefreshKey}
          onView={(doId) => setDoReceiptPreviewId(doId)}
        />
      </main>

      {selectedOrder && (() => {
        const order = selectedOrder;
        const status = String(order.status || 'pending').toLowerCase();
        const isRejected = status === 'rejected';
        const isInvoiced = Boolean(order.invoice_number) || ['invoiced', 'completed'].includes(status);
        const hasDo = Boolean(order.do_number) || ['do_created', 'completed'].includes(status);
        const isAccepted = isInvoiced || hasDo || ['accepted', 'do_created', 'invoiced', 'completed'].includes(status);
        const money = (value: number | string | null | undefined) =>
          Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const orderDate = order.sale_date
          ? new Date(order.sale_date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '-';
        const statusLabel = isInvoiced ? 'Invoiced' : status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
        const statusTone = isRejected
          ? 'bg-rose-500/20 text-rose-100 ring-rose-300/40'
          : isInvoiced
            ? 'bg-violet-500/20 text-violet-100 ring-violet-300/40'
            : isAccepted
              ? 'bg-emerald-500/20 text-emerald-100 ring-emerald-300/40'
              : 'bg-amber-400/20 text-amber-100 ring-amber-300/40';
        const balance = Number(order.balance_amount || 0);
        const items = order.items || [];

        const steps = [
          { label: 'Placed', done: true },
          { label: 'Accepted', done: isAccepted },
          { label: 'DO created', done: hasDo },
          { label: 'Invoiced', done: isInvoiced },
        ];

        const acceptDisabled = processingAction !== null || ['rejected', 'accepted', 'do_created', 'invoiced', 'completed'].includes(String(order.status));
        const rejectDisabled = acceptDisabled || !!order.do_number || !!order.invoice_number;
        const doDisabled = processingAction !== null || ['rejected', 'do_created', 'completed'].includes(String(order.status)) || !!order.do_number;
        const invoiceDisabled = processingAction !== null || order.status === 'rejected' || !!order.invoice_number;

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_40px_120px_-30px_rgba(15,23,42,0.6)]">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-900 px-6 pb-6 pt-5 text-white">
              <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-violet-500/30 blur-3xl" aria-hidden="true" />
              <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" aria-hidden="true" />

              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-100 ring-1 ring-inset ring-white/15">
                      {order.order_type === 'factory_order' ? 'Factory Order' : 'Outlet Order'}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${statusTone}`}>{statusLabel}</span>
                  </div>
                  <h3 className="mt-2 truncate text-xl font-bold tracking-tight sm:text-2xl">{order.sale_number || '-'}</h3>
                  <p className="mt-0.5 text-sm text-indigo-200/80">{orderDate}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-xl bg-white/10 p-2 text-white/80 ring-1 ring-inset ring-white/15 transition hover:bg-white/20 hover:text-white"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>

              {/* Progress */}
              <div className="relative mt-5">
                {isRejected ? (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-100 ring-1 ring-inset ring-rose-300/30">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[11px] font-bold">✕</span>
                    Order rejected{order.rejected_reason ? `: ${order.rejected_reason}` : ''}
                  </div>
                ) : (
                  <ol className="grid grid-cols-4 gap-2">
                    {steps.map((step, index) => (
                      <li key={step.label} className="min-w-0">
                        <div className={`h-1.5 rounded-full ${step.done ? 'bg-gradient-to-r from-emerald-300 to-cyan-300 shadow-[0_0_10px_rgba(110,231,183,0.6)]' : 'bg-white/15'}`} />
                        <p className={`mt-1.5 truncate text-[11px] font-semibold ${step.done ? 'text-white' : 'text-white/45'}`}>
                          {step.done ? '✓ ' : `${index + 1}. `}{step.label}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/60 px-5 py-5 sm:px-6">
              {/* Parties + references */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-200">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Customer</p>
                    <p className="truncate text-sm font-semibold text-slate-900">{order.customer_name || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-500 text-white shadow-md shadow-cyan-200">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 9 5 3h14l2 6" /><path d="M4 9h16v12H4z" /><path d="M9 21v-6h6v6" /></svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Outlet</p>
                    <p className="truncate text-sm font-semibold text-slate-900">{order.outlet?.code || '-'} · {order.outlet?.name || '-'}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">DO number</p>
                      <p className={`truncate text-sm font-semibold ${order.do_number ? 'text-slate-900' : 'text-slate-300'}`}>{order.do_number || 'Not created yet'}</p>
                    </div>
                    {order.do_number ? (
                      <button
                        type="button"
                        onClick={() => void openDoByNumber(String(order.do_number))}
                        disabled={openingDoNumber === order.do_number}
                        className="shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                      >
                        {openingDoNumber === order.do_number ? 'Opening…' : 'View DO'}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Invoice number</p>
                  <p className={`text-sm font-semibold ${order.invoice_number ? 'text-slate-900' : 'text-slate-300'}`}>{order.invoice_number || 'Not created yet'}</p>
                </div>
              </div>

              {/* Money summary */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: 'Quantity', value: Number(order.total_quantity || 0).toFixed(2), tone: 'text-slate-900' },
                  { label: 'Amount', value: money(order.total_amount), tone: 'text-slate-900' },
                  { label: 'Discount', value: money(order.discount_amount), tone: 'text-emerald-600' },
                  { label: `Paid · ${(order.payment_type || 'cash').toUpperCase()}`, value: money(order.paid_amount), tone: 'text-sky-600' },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{tile.label}</p>
                    <p className={`mt-0.5 text-base font-bold ${tile.tone}`}>{tile.value}</p>
                  </div>
                ))}
                <div className={`col-span-2 rounded-2xl px-4 py-3 text-white shadow-lg sm:col-span-1 ${balance > 0 ? 'bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-200' : 'bg-gradient-to-br from-emerald-500 to-teal-500 shadow-emerald-200'}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">{balance > 0 ? 'Balance due' : 'Settled'}</p>
                  <p className="mt-0.5 text-lg font-extrabold">{money(balance)}</p>
                </div>
              </div>

              {/* Notes */}
              {order.notes ? (
                <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                  <span className="text-lg leading-none">📝</span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Notes</p>
                    <p className="text-sm text-amber-900">{order.notes}</p>
                  </div>
                </div>
              ) : null}

              {/* Items */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">Items</p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">No order items found.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 text-sm font-bold text-indigo-700">
                          {String(item.item_name || '?').trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900" title={item.item_name || ''}>{item.item_name || '-'}</p>
                          <p className="truncate text-xs text-slate-500" title={item.item_code || ''}>
                            {item.item_code || '-'}
                            {item.issue_type ? <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{item.issue_type}</span> : null}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-slate-900">{money(item.line_total)}</p>
                          <p className="text-xs text-slate-500">
                            {Number(item.quantity || 0).toFixed(2)} {item.unit || ''} × {money(item.unit_price)}
                            {Number(item.discount_amount || 0) > 0 ? <span className="text-emerald-600"> · −{money(item.discount_amount)}</span> : null}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
              <button
                type="button"
                onClick={() => handleOrderAction('reject')}
                disabled={rejectDisabled}
                className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-transparent"
              >
                {processingAction === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOrderAction('accept')}
                  disabled={acceptDisabled}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {processingAction === 'accept' ? 'Accepting...' : '✓ Accept'}
                </button>
                <button
                  type="button"
                  onClick={openCreateDoModal}
                  disabled={doDisabled}
                  className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-200 transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {processingAction === 'create-do' ? 'Creating...' : 'Create DO'}
                </button>
                <button
                  type="button"
                  onClick={openCreateInvoiceModal}
                  disabled={invoiceDisabled}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
                >
                  {processingAction === 'create-invoice' ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {showCreateDoModal && selectedOrder && (() => {
        const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const selectedLoad = loadOptions.find((load) => load.id === selectedDoLoadId);
        const loadLabel = allocateLoadForDo && selectedLoad
          ? [selectedLoad.load_number || `Load #${selectedLoad.id}`, formatLoadDate(selectedLoad.load_date)].filter(Boolean).join(' · ')
          : 'Factory store (no vehicle load)';
        const cellInput = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

        if (doStep === 'preview') {
          return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-blue-50 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Step 2 of 2</span>
                  <h4 className="text-lg font-bold text-slate-900">Preview Delivery Order</h4>
                </div>
                <p className="mt-0.5 text-sm text-slate-600">Check the lines, apply any discount, then create and print.</p>
              </div>
              <button type="button" onClick={() => setShowCreateDoModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                {[
                  ['Order', selectedOrder.sale_number],
                  ['Customer', selectedOrder.customer_name || '-'],
                  ['Delivery date', formatLoadDate(doDeliveryDate) || '-'],
                  ['Stock from', loadLabel],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                    <p className="truncate font-semibold text-slate-900" title={String(value)}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[720px] w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-xs font-semibold text-slate-500">
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="w-24 px-2 py-2 text-right">Qty</th>
                      <th className="w-28 px-2 py-2 text-right">Unit price</th>
                      <th className="w-44 px-2 py-2 text-right">Discount / unit</th>
                      <th className="w-28 px-3 py-2 text-right">Line total</th>
                      <th className="w-10 px-2 py-2"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {doEditLines.map((line) => (
                      <tr key={line.row_id} className="align-middle">
                        <td className="px-3 py-2">
                          <p className="text-sm font-semibold text-slate-900">{line.item_name}</p>
                          <p className="text-xs text-slate-500">{line.item_code}{line.unit ? ` · ${line.unit}` : ''}</p>
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min="0.01" step="0.01" value={line.quantity} onChange={(e) => updateDoEditLine(line.row_id, 'quantity', Number(e.target.value))} className={cellInput} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateDoEditLine(line.row_id, 'unit_price', Number(e.target.value))} className={cellInput} />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <input type="number" min="0" step="0.01" value={line.discount_value} onChange={(e) => updateDoEditLine(line.row_id, 'discount_value', Number(e.target.value))} className={cellInput} />
                            <select
                              value={line.discount_type}
                              onChange={(e) => updateDoEditLine(line.row_id, 'discount_type', e.target.value as 'amount' | 'percent')}
                              className="rounded-lg border border-slate-300 bg-white px-1.5 py-1.5 text-xs font-semibold text-slate-700"
                              aria-label="Discount type"
                            >
                              <option value="amount">Rs</option>
                              <option value="percent">%</option>
                            </select>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-slate-900">{money(line.line_total)}</td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setDoEditLines((prev) => prev.filter((row) => row.row_id !== line.row_id))}
                            disabled={doEditLines.length <= 1}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
                            title={doEditLines.length <= 1 ? 'A DO needs at least one item' : 'Remove item'}
                            aria-label={`Remove ${line.item_name}`}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="w-full max-w-xs">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Bill discount (whole DO)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={doOrderDiscount}
                      onChange={(e) => setDoOrderDiscount(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-right text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      placeholder="0.00"
                    />
                    <select
                      value={doOrderDiscountType}
                      onChange={(e) => setDoOrderDiscountType(e.target.value as 'amount' | 'percent')}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
                      aria-label="Bill discount type"
                    >
                      <option value="amount">Rs</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </div>
                <dl className="w-full space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm md:w-72">
                  <div className="flex justify-between text-slate-600"><dt>Items subtotal</dt><dd>{money(doEditSubtotal)}</dd></div>
                  <div className="flex justify-between text-emerald-700"><dt>Bill discount</dt><dd>− {money(doEditOrderDiscountAmount)}</dd></div>
                  <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                    <dt className="font-semibold text-slate-900">DO total</dt>
                    <dd className="text-xl font-extrabold text-slate-900">{money(doEditNetTotal)}</dd>
                  </div>
                </dl>
              </div>
              <p className="text-xs text-slate-500">These figures are saved to the order too, so the invoice will use the same prices and discounts.</p>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setDoStep('config')}
                disabled={processingAction !== null}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => void submitCreateDo()}
                disabled={processingAction !== null || doEditLines.length === 0}
                className="rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-200 hover:from-sky-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingAction === 'create-do' ? 'Creating DO...' : 'Confirm, Create DO & Print'}
              </button>
            </div>
          </div>
        </div>
          );
        }

        return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Step 1 of 2</span>
                <h4 className="text-base font-semibold text-slate-900">Create DO Configuration</h4>
              </div>
              <p className="text-xs text-slate-600">Order: {selectedOrder.sale_number}</p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allocateLoadForDo}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAllocateLoadForDo(checked);
                    if (checked && selectedDoLoadId === 0) {
                      setSelectedDoLoadId(-1);
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                />
                Allocate from vehicle load
              </label>

              {allocateLoadForDo && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Select Allocation Load</label>
                  <select
                    value={selectedDoLoadId}
                    onChange={(e) => setSelectedDoLoadId(Number(e.target.value || 0))}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value={-1}>I&apos;ll allocate later</option>
                    <option value={0}>{loadingLoadOptions ? 'Loading loads...' : 'Select in-transit load'}</option>
                    {loadOptions.map((load) => (
                      <option key={load.id} value={load.id}>
                        {[
                          load.load_number || `Load #${load.id}`,
                          formatLoadDate(load.load_date),
                          formatLoadStatus(load.status),
                        ].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Delivery Date</label>
                <input
                  type="date"
                  value={doDeliveryDate}
                  onChange={(e) => setDoDeliveryDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={doCallConfirmed}
                  onChange={(e) => setDoCallConfirmed(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                />
                Customer call confirmed
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateDoModal(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={openDoPreview}
                disabled={processingAction !== null || (allocateLoadForDo && selectedDoLoadId === 0)}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Preview DO →
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {showCreateOrderModal && (() => {
        const previewQty = Number(selectedCreateQty || 0);
        const canAddItem = selectedCreateItemId > 0 && previewQty > 0;
        const hasCustomer = createOrderCustomerName.trim().length > 0;
        const canCreate = createOrderLines.length > 0 && hasCustomer && !creatingOrder && !loadingCreateOrderMeta;
        const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50';
        const labelClass = 'mb-1.5 block text-xs font-semibold text-slate-600';
        const stepBadge = (n: number, done: boolean) => (
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
            {done ? '✓' : n}
          </span>
        );
        const onAddKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addCreateOrderItem();
          }
        };

        return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-lg font-bold text-slate-900">Create Order</h4>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">Factory Order</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">Choose the customer, add the items, then create the order.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateOrderModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              {/* Step 1: customer */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  {stepBadge(1, hasCustomer)}
                  <h5 className="text-sm font-semibold text-slate-900">Customer</h5>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClass}>Find customer</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={createOrderCustomerSearch}
                        onChange={(e) => {
                          setCreateOrderCustomerSearch(e.target.value);
                          setCreateOrderCustomerId(0);
                          setShowCreateOrderCustomerSuggestions(true);
                        }}
                        onFocus={() => setShowCreateOrderCustomerSuggestions(true)}
                        onBlur={() => {
                          window.setTimeout(() => setShowCreateOrderCustomerSuggestions(false), 150);
                        }}
                        placeholder={loadingCreateOrderMeta ? 'Loading customers...' : 'Type customer code or shop name'}
                        className={fieldClass}
                        disabled={loadingCreateOrderMeta}
                      />
                      {showCreateOrderCustomerSuggestions && (
                        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                          {filteredCreateOrderCustomers.length === 0 ? (
                            <div className="px-3 py-2.5 text-sm text-slate-500">No matching customers. You can type the name on the right instead.</div>
                          ) : (
                            filteredCreateOrderCustomers.map((customer) => (
                              <button
                                key={customer.id}
                                type="button"
                                onMouseDown={() => selectCreateOrderCustomer(customer)}
                                className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-blue-50"
                              >
                                <span className="block text-sm font-medium text-slate-900">{customer.shop_name || customer.owner_name || 'Customer'}</span>
                                <span className="block text-xs text-slate-500">{customer.customer_code || '-'}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    {createOrderCustomerId > 0 ? (
                      <p className="mt-1.5 text-xs font-medium text-emerald-700">✓ Registered customer selected</p>
                    ) : (
                      <p className="mt-1.5 text-xs text-slate-500">Pick from the list, or leave empty for a walk-in customer.</p>
                    )}
                  </div>

                  <div>
                    <label className={labelClass}>Name on order <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      value={createOrderCustomerName}
                      onChange={(e) => {
                        setCreateOrderCustomerName(e.target.value);
                        if (createOrderCustomerId > 0) {
                          setCreateOrderCustomerId(0);
                        }
                      }}
                      placeholder="Filled automatically, or type a name"
                      className={fieldClass}
                    />
                    <p className="mt-1.5 text-xs text-slate-500">Editing this name unlinks the selected customer.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClass}>Notes <span className="font-normal text-slate-400">(optional)</span></label>
                    <input
                      type="text"
                      value={createOrderNotes}
                      onChange={(e) => setCreateOrderNotes(e.target.value)}
                      placeholder="Delivery instructions or remarks"
                      className={fieldClass}
                    />
                  </div>
                </div>
              </section>

              {/* Step 2: items */}
              <section className="border-t border-slate-100 pt-5">
                <div className="mb-3 flex items-center gap-2">
                  {stepBadge(2, createOrderLines.length > 0)}
                  <h5 className="text-sm font-semibold text-slate-900">Items</h5>
                  {createOrderLines.length > 0 ? (
                    <span className="text-xs text-slate-500">· {createOrderLines.length} added</span>
                  ) : null}
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:p-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-12 md:items-end">
                    <div className="relative col-span-2 md:col-span-7">
                      <label className={labelClass}>Item</label>
                      <input
                        type="text"
                        value={createOrderItemSearch}
                        onChange={(e) => {
                          setCreateOrderItemSearch(e.target.value);
                          setSelectedCreateItemId(0);
                          setShowCreateOrderItemSuggestions(true);
                        }}
                        onFocus={() => setShowCreateOrderItemSuggestions(true)}
                        onBlur={() => {
                          window.setTimeout(() => setShowCreateOrderItemSuggestions(false), 150);
                        }}
                        placeholder={loadingCreateOrderMeta ? 'Loading items...' : 'Type item code or name'}
                        className={fieldClass}
                        title={createOrderItemSearch}
                        disabled={loadingCreateOrderMeta}
                      />
                      {showCreateOrderItemSuggestions && (
                        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                          {filteredCreateOrderItems.length === 0 ? (
                            <div className="px-3 py-2.5 text-sm text-slate-500">No matching items found.</div>
                          ) : (
                            filteredCreateOrderItems.map((item) => {
                              const stock = Number(item.current_stock || 0);
                              const outOfStock = stock <= 0;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onMouseDown={() => selectCreateOrderItem(item)}
                                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 ${outOfStock ? 'bg-slate-50/80 hover:bg-rose-50/60' : 'hover:bg-blue-50'}`}
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className={`block truncate text-sm font-medium ${outOfStock ? 'text-slate-500' : 'text-slate-900'}`}>{item.name || 'Item'}</span>
                                    <span className="block truncate text-xs text-slate-400">{item.code || '-'}</span>
                                  </span>
                                  {outOfStock ? (
                                    <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Out of stock</span>
                                  ) : (
                                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{stock.toLocaleString('en-US', { maximumFractionDigits: 2 })} in stock</span>
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2 md:col-span-2">
                      <label className={labelClass}>Quantity</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={selectedCreateQty}
                        onChange={(e) => setSelectedCreateQty(e.target.value)}
                        onKeyDown={onAddKeyDown}
                        placeholder="0"
                        className={`${fieldClass} text-right`}
                      />
                    </div>
                    <div className="md:col-span-3">
                      <button
                        type="button"
                        onClick={addCreateOrderItem}
                        disabled={!canAddItem}
                        className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        + Add to order
                      </button>
                    </div>
                  </div>
                  <p className={`mt-2 text-xs ${selectedCreateItemId > 0 && (createOrderStockById.get(selectedCreateItemId) ?? 0) <= 0 ? 'font-medium text-amber-700' : 'text-slate-500'}`}>
                    {selectedCreateItemId > 0 ? (createOrderStockById.get(selectedCreateItemId) ?? 0) <= 0
                      ? '⚠ This item is out of stock in the factory store. You can still order it, but a DO cannot be created until stock is available.'
                      : 'Press Enter in Quantity to add quickly. Adding the same item again increases its quantity. Prices are applied when the invoice is created.' : 'Select an item from the list to enable “Add to order”.'}
                  </p>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <div className="max-h-[36vh] overflow-auto">
                    <table className="min-w-full divide-y divide-slate-200 bg-white">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Item</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Qty</th>
                          <th className="w-10 px-3 py-2"><span className="sr-only">Remove</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {createOrderLines.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-3 py-8 text-center">
                              <p className="text-sm font-medium text-slate-600">No items yet</p>
                              <p className="mt-0.5 text-xs text-slate-400">Items you add above will appear here.</p>
                            </td>
                          </tr>
                        ) : (
                          createOrderLines.map((line) => (
                            <tr key={line.row_id} className="hover:bg-slate-50/70">
                              <td className="px-3 py-2.5">
                                <p className="text-sm font-medium text-slate-900">
                                  {line.item_name}
                                  {(createOrderStockById.get(line.inventory_item_id) ?? 0) <= 0 ? (
                                    <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-rose-700">Out of stock</span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-slate-500">{line.item_code}{line.unit ? ` · ${line.unit}` : ''}</p>
                              </td>
                              <td className="px-3 py-2.5 text-right text-sm text-slate-700">{Number(line.quantity || 0).toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeCreateOrderItem(line.row_id)}
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  aria-label={`Remove ${line.item_name}`}
                                  title="Remove item"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer: totals + actions */}
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-slate-500">Total quantity</p>
                  <p className="text-xl font-bold text-slate-900">{createOrderTotalQty.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Items</p>
                  <p className="text-xl font-bold text-slate-900">{createOrderLines.length}</p>
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-1 sm:items-end">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateOrderModal(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitCreateOrder()}
                    disabled={!canCreate}
                    className="flex-1 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:flex-none"
                  >
                    {creatingOrder ? 'Creating...' : 'Create Order'}
                  </button>
                </div>
                {!canCreate && !creatingOrder ? (
                  <p className="text-xs text-slate-500">
                    {!hasCustomer ? 'Choose a customer or enter a name.' : createOrderLines.length === 0 ? 'Add at least one item.' : ''}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {showCreateInvoiceModal && selectedOrder && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-5">
          <div className="max-h-[94vh] w-[98vw] max-w-[1800px] overflow-y-auto rounded-3xl border border-white/60 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.35)] sm:p-6">
            <div className="mb-5 flex items-center justify-between rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-violet-50 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-lg font-bold text-white shadow-lg shadow-indigo-200">
                  $
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-bold tracking-tight text-slate-900">Order To Invoice</h4>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-700">Final Review</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">Review items, discounts, and payment details before creating the invoice.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateInvoiceModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm text-white shadow-lg shadow-slate-200">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Source Order</div>
                <div className="mt-0.5 font-bold tracking-wide">{selectedOrder.sale_number || '-'}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                Ready for invoice
              </div>
            </div>

            <div className="max-h-[42vh] overflow-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="min-w-full table-fixed divide-y divide-slate-200 bg-white">
                <thead className="sticky top-0 z-10 bg-gradient-to-r from-slate-50 to-indigo-50">
                  <tr>
                    <th className="w-[48%] px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Item</th>
                    <th className="w-[12%] px-3 py-3 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Qty</th>
                    <th className="w-[14%] px-3 py-3 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Unit Price</th>
                    <th className="w-[16%] px-3 py-3 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Line Discount</th>
                    <th className="w-[10%] px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Net Line</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoiceEditLines.map((line) => (
                    <tr key={line.row_id} className="transition hover:bg-indigo-50/40">
                      <td className="px-4 py-3 text-sm text-slate-800">
                        <div className="truncate font-semibold text-slate-900">{line.item_code || '-'} <span className="font-normal text-slate-400">-</span> {line.item_name || '-'}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">Unit: {line.unit || '-'}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) => updateInvoiceEditLine(line.row_id, 'quantity', Number(e.target.value || 0))}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm font-medium text-slate-800 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(e) => updateInvoiceEditLine(line.row_id, 'unit_price', Number(e.target.value || 0))}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm font-medium text-slate-800 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex w-full items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.discount_value}
                            onChange={(e) => updateInvoiceEditLine(line.row_id, 'discount_value', Number(e.target.value || 0))}
                            className="w-[58%] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm font-medium text-slate-800 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          />
                          <select
                            value={line.discount_type}
                            onChange={(e) => updateInvoiceEditLine(line.row_id, 'discount_type', e.target.value as 'amount' | 'percent')}
                            className="w-[42%] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-800 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
                          >
                            <option value="amount">Amount</option>
                            <option value="percent">%</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-indigo-700">{line.line_total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Subtotal</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{invoiceEditSubtotal.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-500">Order Discount</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoiceOrderDiscount}
                    onChange={(e) => setInvoiceOrderDiscount(e.target.value)}
                    className="w-24 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-right text-sm text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  />
                  <select
                    value={invoiceOrderDiscountType}
                    onChange={(e) => setInvoiceOrderDiscountType(e.target.value as 'amount' | 'percent')}
                    className="w-28 rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  >
                    <option value="amount">Amount</option>
                    <option value="percent">Percentage (%)</option>
                  </select>
                </div>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-500">Net Total</div>
                <div className="mt-1 text-lg font-bold text-indigo-700">{invoiceEditNetTotal.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-600">Paid Amount</div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoicePaidAmount}
                  onChange={(e) => setInvoicePaidAmount(e.target.value)}
                  className="w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-right text-sm font-semibold text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600">Payment Method</div>
                <select
                  value={invoicePaymentType}
                  onChange={(e) => setInvoicePaymentType(e.target.value as 'cash' | 'bank' | 'card' | 'online' | 'cheque')}
                  className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                >
                  <option value="cash">Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-600">Balance Due</div>
                <div className="mt-1 text-lg font-bold text-amber-700">{invoiceBalanceAmount.toFixed(2)}</div>
              </div>
            </div>

            {invoicePaymentType === 'bank' && (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-4 text-sm text-slate-700 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">$</span>
                  <div>
                    <div className="font-bold text-slate-900">Bank Transfer Details</div>
                    <div className="text-xs text-slate-500">Choose the company account receiving this payment.</div>
                  </div>
                </div>
                <select
                  value={invoiceBankAccountId}
                  onChange={(e) => setInvoiceBankAccountId(e.target.value)}
                  disabled={loadingInvoicePaymentOptions}
                  className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">
                    {loadingInvoicePaymentOptions ? 'Loading bank accounts...' : 'Select receiving bank account'}
                  </option>
                  {invoiceBankAccounts.map((account) => (
                    <option key={account.id} value={String(account.id)}>
                      {account.bank_name || 'Bank'} - {account.account_no || 'No account number'}
                      {account.branch ? ` (${account.branch})` : ''}
                    </option>
                  ))}
                </select>
                {selectedInvoiceBankAccount && (
                  <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-blue-100 bg-white px-3 py-3 text-xs text-slate-600 shadow-sm sm:grid-cols-3">
                    <span><strong>Bank:</strong> {selectedInvoiceBankAccount.bank_name || '-'}</span>
                    <span><strong>Branch:</strong> {selectedInvoiceBankAccount.branch || '-'}</span>
                    <span><strong>Account:</strong> {selectedInvoiceBankAccount.account_no || '-'}</span>
                  </div>
                )}
                {!loadingInvoicePaymentOptions && invoiceBankAccounts.length === 0 && (
                  <p className="mt-2 text-xs text-rose-700">No company bank accounts are configured.</p>
                )}
              </div>
            )}

            {invoicePaymentType === 'cheque' && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-4 text-sm text-slate-700 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-xs font-bold text-white">#</span>
                  <div>
                    <div className="font-bold text-slate-900">Cheque Details</div>
                    <div className="text-xs text-slate-500">Capture the cheque information for tracking and reconciliation.</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Cheque Number</span>
                    <input
                      type="text"
                      value={invoiceChequeNumber}
                      onChange={(e) => setInvoiceChequeNumber(e.target.value)}
                      placeholder="Enter cheque number"
                      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Cheque Date</span>
                    <input
                      type="date"
                      value={invoiceChequeDate}
                      onChange={(e) => setInvoiceChequeDate(e.target.value)}
                      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Cheque Bank</span>
                    <input
                      type="text"
                      value={invoiceChequeBankName}
                      onChange={(e) => setInvoiceChequeBankName(e.target.value)}
                      placeholder="Enter bank name"
                      className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div className="hidden text-xs text-slate-500 sm:block">
                Check all values before creating the invoice.
              </div>
              <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateInvoiceModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitCreateInvoiceWithEdit()}
                disabled={processingAction !== null}
                className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:from-indigo-700 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingAction === 'create-invoice' ? 'Creating...' : 'Create Invoice'}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <DoReceiptPreview
        doId={doReceiptPreviewId}
        token={token}
        apiUrl={API_URL}
        onClose={() => setDoReceiptPreviewId(null)}
      />

      {orderToDelete && (
        <div className="fixed inset-0 z-[78] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
              </span>
              <div className="min-w-0">
                <h4 className="text-base font-semibold text-slate-900">Delete this order?</h4>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">{orderToDelete.sale_number}</span>
                  {orderToDelete.customer_name ? <> for {orderToDelete.customer_name}</> : null}
                  {' '}({Number(orderToDelete.total_amount || 0).toFixed(2)}) and all its item lines will be permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOrderToDelete(null)}
                disabled={deletingOrder}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteOrder()}
                disabled={deletingOrder}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deletingOrder ? 'Deleting...' : 'Delete order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModalMessage && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h4 className="text-base font-semibold text-slate-900">Action Alert</h4>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{alertModalMessage}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setAlertModalMessage('')}
                className="rounded-md border border-violet-200 bg-violet-100 px-4 py-1.5 text-sm font-semibold text-violet-700 hover:bg-violet-200"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showRejectReasonModal && selectedOrder && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.3)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-lg text-red-600">
                !
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Reject Order</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Add a reason for rejecting order <span className="font-semibold text-slate-700">{selectedOrder.sale_number || '-'}</span>.
                  This field is optional.
                </p>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Reject Reason</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                autoFocus
                placeholder="Enter the reason for rejection..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-400 focus:bg-white focus:ring-4 focus:ring-red-100"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectReasonModal(false);
                  setRejectReason('');
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRejectOrder()}
                disabled={processingAction !== null}
                className="rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-200 hover:from-red-700 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingAction === 'reject' ? 'Rejecting...' : 'Reject Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
