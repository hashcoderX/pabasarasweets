'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

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
  unit_price: number;
  line_total: number;
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
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [message, setMessage] = useState('');
  const [processingAction, setProcessingAction] = useState<'accept' | 'reject' | 'create-do' | 'create-invoice' | null>(null);
  const [showCreateDoModal, setShowCreateDoModal] = useState(false);
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
  const [selectedCreatePrice, setSelectedCreatePrice] = useState('0');
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
  const createOrderTotalAmount = createOrderLines.reduce((sum, row) => sum + Number(row.line_total || 0), 0);
  const invoiceEditSubtotal = invoiceEditLines.reduce((sum, row) => sum + Number(row.line_total || 0), 0);
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
    if (!keyword) return createOrderInventory.slice(0, 20);
    return createOrderInventory
      .filter((item) => (`${item.code || ''} ${item.name || ''}`).toLowerCase().includes(keyword))
      .slice(0, 20);
  }, [createOrderInventory, createOrderItemSearch]);

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
    setSelectedCreatePrice('0');
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
        axios.get(`${API_URL}/api/stock/inventory`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 200, status: 'active' },
        }),
      ]);

      const customerRows = Array.isArray(customerRes.data?.data?.data) ? customerRes.data.data.data : [];
      const inventoryRows = Array.isArray(inventoryRes.data?.data?.data) ? inventoryRes.data.data.data : [];
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
    const price = Number(selectedCreatePrice || 0);

    if (!selectedItem) {
      setMessage('Please select an item.');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage('Quantity must be greater than 0.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setMessage('Unit price must be 0 or greater.');
      return;
    }

    const normalizedId = Number(selectedItem.id || 0);
    const lineTotal = qty * price;
    setCreateOrderLines((prev) => {
      const existing = prev.find((line) => line.inventory_item_id === normalizedId);
      if (existing) {
        return prev.map((line) => (
          line.inventory_item_id === normalizedId
            ? {
              ...line,
              quantity: Number(line.quantity || 0) + qty,
              line_total: (Number(line.quantity || 0) + qty) * Number(line.unit_price || 0),
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
          unit_price: price,
          line_total: lineTotal,
        },
      ];
    });
    setSelectedCreateQty('1');
    setCreateOrderItemSearch('');
    setSelectedCreateItemId(0);
    setShowCreateOrderItemSuggestions(false);
  }, [createOrderInventory, selectedCreateItemId, selectedCreatePrice, selectedCreateQty]);

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
    setSelectedCreatePrice(String(Number(item.sell_price ?? item.unit_price ?? 0)));
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
            unit_price: line.unit_price,
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

  const downloadDoReceipt = useCallback(async (distributionDoId: number) => {
    if (!token || distributionDoId <= 0) return;
    try {
      const response = await axios.get(`${API_URL}/api/distribution/dos/${distributionDoId}/receipt`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `do-receipt-${distributionDoId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to generate DO receipt:', error);
      setMessage('DO created, but receipt generation failed.');
    }
  }, [API_URL, token]);

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

  const submitRejectOrder = useCallback(async () => {
    const ok = await handleOrderAction('reject', { reason: rejectReason.trim() });
    if (ok) {
      setShowRejectReasonModal(false);
      setRejectReason('');
    }
  }, [handleOrderAction, rejectReason]);

  const openCreateDoModal = useCallback(() => {
    setDoDeliveryDate(new Date().toISOString().slice(0, 10));
    setAllocateLoadForDo(false);
    setSelectedDoLoadId(-1);
    setDoCallConfirmed(false);
    setShowCreateDoModal(true);
    void loadVehicleLoads();
  }, [loadVehicleLoads]);

  const submitCreateDo = useCallback(async () => {
    const ok = await handleOrderAction('create-do', {
      allocate_load: allocateLoadForDo && selectedDoLoadId > 0,
      load_id: allocateLoadForDo && selectedDoLoadId > 0 ? selectedDoLoadId : null,
      delivery_date: doDeliveryDate || null,
      call_confirmed: doCallConfirmed,
    });
    if (ok) {
      setShowCreateDoModal(false);
    }
  }, [allocateLoadForDo, doCallConfirmed, doDeliveryDate, handleOrderAction, selectedDoLoadId]);

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
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse animation-delay-4000"></div>
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
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(row)}
                          className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          View
                        </button>
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
      </main>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/70 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-semibold text-slate-900">Order Preview</h3>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
              <div><span className="font-semibold text-slate-900">Order #:</span> {selectedOrder.sale_number || '-'}</div>
              <div><span className="font-semibold text-slate-900">Date:</span> {selectedOrder.sale_date ? new Date(selectedOrder.sale_date).toLocaleString() : '-'}</div>
              <div><span className="font-semibold text-slate-900">Outlet:</span> {selectedOrder.outlet?.code || '-'} - {selectedOrder.outlet?.name || '-'}</div>
              <div><span className="font-semibold text-slate-900">Customer:</span> {selectedOrder.customer_name || '-'}</div>
              <div><span className="font-semibold text-slate-900">Remark:</span> {selectedOrder.order_type === 'factory_order' ? 'Factory Order' : 'Outlet Order'}</div>
              <div><span className="font-semibold text-slate-900">Status:</span> {selectedOrder.status || '-'}</div>
              <div><span className="font-semibold text-slate-900">DO #:</span> {selectedOrder.do_number || '-'}</div>
              <div><span className="font-semibold text-slate-900">Invoice #:</span> {selectedOrder.invoice_number || '-'}</div>
              <div><span className="font-semibold text-slate-900">Quantity:</span> {Number(selectedOrder.total_quantity || 0).toFixed(2)}</div>
              <div><span className="font-semibold text-slate-900">Amount:</span> {Number(selectedOrder.total_amount || 0).toFixed(2)}</div>
              <div><span className="font-semibold text-slate-900">Discount:</span> {Number(selectedOrder.discount_amount || 0).toFixed(2)}</div>
              <div><span className="font-semibold text-slate-900">Paid:</span> {Number(selectedOrder.paid_amount || 0).toFixed(2)} ({(selectedOrder.payment_type || 'cash').toUpperCase()})</div>
              <div><span className="font-semibold text-slate-900">Balance:</span> {Number(selectedOrder.balance_amount || 0).toFixed(2)}</div>
            </div>
            {selectedOrder.status === 'rejected' && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <span className="font-semibold">Reject Reason:</span> {selectedOrder.rejected_reason || '-'}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => handleOrderAction('accept')}
                disabled={processingAction !== null || selectedOrder.status === 'rejected' || selectedOrder.status === 'accepted' || selectedOrder.status === 'do_created' || selectedOrder.status === 'invoiced' || selectedOrder.status === 'completed'}
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingAction === 'accept' ? 'Accepting...' : 'Accept Order'}
              </button>
              <button
                type="button"
                onClick={() => handleOrderAction('reject')}
                disabled={processingAction !== null || selectedOrder.status === 'rejected' || selectedOrder.status === 'accepted' || selectedOrder.status === 'do_created' || selectedOrder.status === 'invoiced' || selectedOrder.status === 'completed' || !!selectedOrder.do_number || !!selectedOrder.invoice_number}
                className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingAction === 'reject' ? 'Rejecting...' : 'Reject Order'}
              </button>
              <button
                type="button"
                onClick={openCreateDoModal}
                disabled={processingAction !== null || selectedOrder.status === 'rejected' || selectedOrder.status === 'do_created' || selectedOrder.status === 'completed' || !!selectedOrder.do_number}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingAction === 'create-do' ? 'Creating...' : 'Create DO'}
              </button>
              <button
                type="button"
                onClick={openCreateInvoiceModal}
                disabled={processingAction !== null || selectedOrder.status === 'rejected' || !!selectedOrder.invoice_number}
                className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingAction === 'create-invoice' ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>

            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Notes:</span> {selectedOrder.notes || '-'}
            </div>

            <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 bg-white">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Item</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Issue</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Discount</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedOrder.items || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">No order items found.</td>
                    </tr>
                  ) : (
                    (selectedOrder.items || []).map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-sm text-slate-800">
                          <div className="font-medium">{item.item_code || '-'} - {item.item_name || '-'}</div>
                          <div className="text-xs text-slate-500">{item.unit || '-'}</div>
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-700">{item.issue_type || '-'}</td>
                        <td className="px-3 py-2 text-sm text-right text-slate-700">{Number(item.quantity || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-right text-slate-700">{Number(item.unit_price || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-right text-slate-700">{Number(item.discount_amount || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-right font-semibold text-slate-900">{Number(item.line_total || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showCreateDoModal && selectedOrder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 border-b border-slate-200 pb-2">
              <h4 className="text-base font-semibold text-slate-900">Create DO Configuration</h4>
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
                        {load.load_number || `Load #${load.id}`} {load.load_date ? `(${load.load_date})` : ''} {load.status ? `- ${load.status}` : ''}
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
                onClick={() => void submitCreateDo()}
                disabled={processingAction !== null || (allocateLoadForDo && selectedDoLoadId === 0)}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processingAction === 'create-do' ? 'Creating...' : 'Create DO & Print'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateOrderModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
          <div className="max-h-[94vh] w-[98vw] max-w-[1800px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Create Order</h4>
                <p className="text-xs text-slate-600">Create a new order with customer and item lines.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateOrderModal(false)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Order Type</label>
                <div className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
                  Factory Order
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Choose Customer</label>
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
                    placeholder={loadingCreateOrderMeta ? 'Loading customers...' : 'Search customer code/name...'}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    disabled={loadingCreateOrderMeta}
                  />
                  {showCreateOrderCustomerSuggestions && (
                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                      {filteredCreateOrderCustomers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">No matching customers found.</div>
                      ) : (
                        filteredCreateOrderCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onMouseDown={() => selectCreateOrderCustomer(customer)}
                            className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 last:border-b-0"
                          >
                            {customer.customer_code || '-'} - {customer.shop_name || customer.owner_name || 'Customer'}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Customer Name</label>
                <input
                  type="text"
                  value={createOrderCustomerName}
                  onChange={(e) => {
                    setCreateOrderCustomerName(e.target.value);
                    if (createOrderCustomerId > 0) {
                      setCreateOrderCustomerId(0);
                    }
                  }}
                  placeholder="Enter customer name"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Notes</label>
                <input
                  type="text"
                  value={createOrderNotes}
                  onChange={(e) => setCreateOrderNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-4 rounded-md border border-slate-200 p-3">
              <h5 className="mb-2 text-sm font-semibold text-slate-800">Add Item</h5>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div className="relative">
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
                    placeholder={loadingCreateOrderMeta ? 'Loading items...' : 'Search item code/name...'}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    disabled={loadingCreateOrderMeta}
                  />
                  {showCreateOrderItemSuggestions && (
                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                      {filteredCreateOrderItems.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500">No matching items found.</div>
                      ) : (
                        filteredCreateOrderItems.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onMouseDown={() => selectCreateOrderItem(item)}
                            className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 last:border-b-0"
                          >
                            {item.code || '-'} - {item.name || 'Item'}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={selectedCreateQty}
                  onChange={(e) => setSelectedCreateQty(e.target.value)}
                  placeholder="Qty"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={selectedCreatePrice}
                  onChange={(e) => {
                    setSelectedCreatePrice(e.target.value);
                  }}
                  placeholder="Unit Price"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={addCreateOrderItem}
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Add Item
                </button>
              </div>
            </div>

            <div className="mt-3 max-h-[40vh] overflow-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 bg-white">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Item</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Price</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Amount</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {createOrderLines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">No items added yet.</td>
                    </tr>
                  ) : (
                    createOrderLines.map((line) => (
                      <tr key={line.row_id}>
                        <td className="px-3 py-2 text-sm text-slate-800">{line.item_code} - {line.item_name} {line.unit ? `(${line.unit})` : ''}</td>
                        <td className="px-3 py-2 text-sm text-right text-slate-700">{Number(line.quantity || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-right text-slate-700">{Number(line.unit_price || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-sm text-right font-semibold text-slate-900">{Number(line.line_total || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeCreateOrderItem(line.row_id)}
                            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="text-slate-700">Total Qty: <span className="font-semibold text-slate-900">{createOrderTotalQty.toFixed(2)}</span></div>
              <div className="text-slate-700">Total Amount: <span className="font-semibold text-slate-900">{createOrderTotalAmount.toFixed(2)}</span></div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateOrderModal(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitCreateOrder()}
                disabled={creatingOrder || loadingCreateOrderMeta}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creatingOrder ? 'Creating...' : 'Create Order'}
              </button>
            </div>
          </div>
        </div>
      )}

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
