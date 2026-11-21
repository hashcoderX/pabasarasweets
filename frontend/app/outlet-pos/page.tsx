'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import axios from '@/lib/http';

type StockLine = {
  inventory_item_id: number;
  name: string;
  code: string;
  unit: string;
  sell_price: number;
  transferred_qty: number;
  sold_qty: number;
  available_qty: number;
};

type SaleRow = {
  id: number;
  sale_number: string;
  sale_date: string;
  customer_name?: string;
  total_quantity: number;
  total_amount: number;
  do_number?: string | null;
  order_type?: string | null;
  source?: string | null;
  discount_amount?: number;
  paid_amount?: number;
  balance_amount?: number;
  payment_type?: string;
  notes?: string | null;
  loyalty_customer?: {
    customer_code?: string;
  } | null;
  items?: Array<{
    id: number;
    item_code?: string;
    item_name?: string;
    unit?: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

type CashierSessionStatus = {
  is_open: boolean;
  is_closed: boolean;
  needs_open: boolean;
  session_date?: string;
};

type CashDrawerStatus = {
  balance: number;
};

type OutletDayPaymentSummary = {
  session_date?: string;
  outlet_total_business: number;
  cash_collection_total: number;
  bank_transfer_total: number;
  card_payment_total: number;
};

type DailyBalanceSheet = {
  session_date: string;
  opening_balance: number;
  closing_balance: number;
  balance_difference: number;
  total_sales: number;
  total_sales_amount: number;
};

type PendingTransferRecord = {
  id: number;
  session_date: string;
  amount: number;
  status: string;
  start_amount?: number;
  total_sale?: number;
  card_collection_total?: number;
  bank_transfer_total?: number;
  cash_collection_total?: number;
  note?: string | null;
  requested_at?: string | null;
  requested_by_name?: string | null;
};

type AlertModalState = {
  open: boolean;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'error';
};

type ConfirmModalState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
};

type OpenDayModalState = {
  open: boolean;
  openingAmount: string;
};

type CloseDayModalState = {
  open: boolean;
  transferToMainAccount: boolean;
};

function OutletPosDashboardContent() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [outletName, setOutletName] = useState('');
  const [outletCode, setOutletCode] = useState('');
  const [outletId, setOutletId] = useState<number | null>(null);
  const [stocks, setStocks] = useState<StockLine[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [salesInvoiceSearch, setSalesInvoiceSearch] = useState('');
  const [salesFromDate, setSalesFromDate] = useState('');
  const [salesToDate, setSalesToDate] = useState('');
  const [latestSalesPage, setLatestSalesPage] = useState(1);
  const [latestSalesPageSize, setLatestSalesPageSize] = useState(8);
  const [cashierSession, setCashierSession] = useState<CashierSessionStatus | null>(null);
  const [cashDrawer, setCashDrawer] = useState<CashDrawerStatus | null>(null);
  const [dayPaymentSummary, setDayPaymentSummary] = useState<OutletDayPaymentSummary | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransferRecord[]>([]);
  const [selectedInvoiceSale, setSelectedInvoiceSale] = useState<SaleRow | null>(null);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<'80mm' | '58mm' | 'A4'>('80mm');
  const [balanceSheetDate, setBalanceSheetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dailyBalanceSheet, setDailyBalanceSheet] = useState<DailyBalanceSheet | null>(null);
  const [balanceSheetLoading, setBalanceSheetLoading] = useState(false);
  const [dayToggleLoading, setDayToggleLoading] = useState(false);
  const [alertModal, setAlertModal] = useState<AlertModalState>({
    open: false,
    title: '',
    message: '',
    tone: 'info',
  });
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
  });
  const [openDayModal, setOpenDayModal] = useState<OpenDayModalState>({
    open: false,
    openingAmount: '0.00',
  });
  const [closeDayModal, setCloseDayModal] = useState<CloseDayModalState>({
    open: false,
    transferToMainAccount: true,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [embeddedPath, setEmbeddedPath] = useState<string>('');
  const [embeddedSrc, setEmbeddedSrc] = useState<string>('');
  const [embeddedLoading, setEmbeddedLoading] = useState(false);
  const embeddedFrameRef = useRef<HTMLIFrameElement | null>(null);
  const hasLoadedDashboardRef = useRef(false);
  const confirmActionRef = useRef<(() => void) | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

  const getPathWithCode = (path: string, embedded = false) => {
    const outletCode = params.get('outlet_code') || '';
    const query = new URLSearchParams();
    if (outletCode) query.set('outlet_code', outletCode);
    if (embedded) query.set('embedded', '1');
    const queryString = query.toString();
    return `${path}${queryString ? `?${queryString}` : ''}`;
  };

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });
  const showAlertModal = (message: string, title = 'Notice', tone: AlertModalState['tone'] = 'info') => {
    setAlertModal({
      open: true,
      title,
      message,
      tone,
    });
  };

  const openConfirmModal = (
    options: Omit<ConfirmModalState, 'open'>,
    onConfirm: () => void
  ) => {
    confirmActionRef.current = onConfirm;
    setConfirmModal({
      open: true,
      ...options,
    });
  };

  const closeConfirmModal = () => {
    confirmActionRef.current = null;
    setConfirmModal((prev) => ({ ...prev, open: false }));
  };

  const confirmModalAction = () => {
    const action = confirmActionRef.current;
    closeConfirmModal();
    if (action) action();
  };

  const cleanEmbeddedFrameUi = () => {
    const frame = embeddedFrameRef.current;
    if (!frame) return;

    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.head) return;

      const styleId = 'embedded-frame-ui-cleanup';
      if (doc.getElementById(styleId)) return;

      const style = doc.createElement('style');
      style.id = styleId;
      style.textContent = `
        html, body {
          background: #ffffff !important;
        }
        nextjs-portal,
        #__next-build-watcher,
        [data-nextjs-toast],
        [data-nextjs-dev-tools-button] {
          display: none !important;
        }
      `;
      doc.head.appendChild(style);
    } catch (error) {
      console.warn('Failed to clean embedded frame UI:', error);
    }
  };

  const sidebarItems = [
    { href: '/outlet-pos', icon: '📊', label: 'Dashboard' },
    { href: '/outlet-pos/create-sale', icon: '➕', label: 'Create Sale' },
    { href: '/outlet-pos/sales', icon: '🧾', label: 'Open Recent Sales' },
    { href: '/outlet-pos/cash-drawer', icon: '💵', label: 'Cash Drawer' },
    { href: '/outlet-pos/stock', icon: '📦', label: 'Stock' },
    { href: '/outlet-pos/loyalty-customers', icon: '🎁', label: 'Loyalty Customers' },
  ];

  const openEmbeddedPage = (path: string) => {
    if (path === '/outlet-pos') {
      setEmbeddedPath('');
      setEmbeddedSrc('');
      setEmbeddedLoading(false);
      return;
    }
    const nextSrc = getPathWithCode(path, true);
    if (path === embeddedPath && nextSrc === embeddedSrc) {
      return;
    }
    setEmbeddedLoading(true);
    setEmbeddedPath(path);
    setEmbeddedSrc(nextSrc);
  };

  const refreshEmbeddedPageIfOpen = () => {
    if (!embeddedPath) return;
    const nextSrcBase = getPathWithCode(embeddedPath, true);
    const separator = nextSrcBase.includes('?') ? '&' : '?';
    setEmbeddedLoading(true);
    setEmbeddedSrc(`${nextSrcBase}${separator}_refresh=${Date.now()}`);
  };

  const redirectToLoginWithNext = () => {
    localStorage.removeItem('token');
    router.push(`/?next=${encodeURIComponent(getPathWithCode('/outlet-pos'))}`);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const invalidStoredToken = !storedToken || storedToken === 'undefined' || storedToken === 'null';

    if (invalidStoredToken) {
      router.push(`/?next=${encodeURIComponent(getPathWithCode('/outlet-pos'))}`);
      return;
    }

    setToken(storedToken);
  }, [router, params]);

  const loadData = async (authToken: string) => {
    const profileRes = await axios.get(`${API_URL}/api/outlet-pos/me`, {
      headers: authHeaders(authToken),
      validateStatus: () => true,
    });

    if (profileRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (profileRes.status >= 400) {
      showAlertModal(profileRes.data?.message || 'Failed to load outlet profile.', 'Load Failed', 'error');
      return false;
    }

    const payload = profileRes.data?.data;
    const outlet = payload?.outlet;

    if (!outlet) {
      redirectToLoginWithNext();
      return false;
    }

    setOutletName(outlet.name || 'Outlet');
    setOutletCode(outlet.code || '-');
    const currentOutletId = Number(outlet.id) || null;
    setOutletId(currentOutletId);
    setStocks((payload?.stocks || []).filter((line: StockLine) => Number(line.available_qty) > 0));

    const sessionRes = await axios.get(`${API_URL}/api/outlet-pos/cash-drawer-status`, {
      headers: authHeaders(authToken),
      validateStatus: () => true,
    });

    if (sessionRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (sessionRes.status < 400) {
      setCashierSession(sessionRes.data?.data?.session || null);
      setCashDrawer(sessionRes.data?.data?.cash_drawer || null);
      setPendingTransfers(Array.isArray(sessionRes.data?.data?.pending_transfers) ? sessionRes.data.data.pending_transfers : []);
      const summary = sessionRes.data?.data?.day_payment_summary;
      setDayPaymentSummary(summary
        ? {
            session_date: summary?.session_date,
            outlet_total_business: Number(summary?.outlet_total_business || 0),
            cash_collection_total: Number(summary?.cash_collection_total || 0),
            bank_transfer_total: Number(summary?.bank_transfer_total || 0),
            card_payment_total: Number(summary?.card_payment_total || 0),
          }
        : null);
    }

    const salesRes = await axios.get(`${API_URL}/api/outlet-pos/sales`, {
      headers: authHeaders(authToken),
      params: { per_page: 100 },
      validateStatus: () => true,
    });

    if (salesRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (salesRes.status >= 400) {
      showAlertModal(salesRes.data?.message || 'Failed to load outlet sales.', 'Load Failed', 'error');
      setSales([]);
      return false;
    }

    setSales(salesRes.data?.data?.data || []);

    if (currentOutletId) {
      await loadDailyBalanceSheet(authToken, currentOutletId, balanceSheetDate);
    }

    return true;
  };

  const loadDailyBalanceSheet = async (authToken: string, currentOutletId?: number | null, sessionDate?: string) => {
    const targetOutletId = currentOutletId || outletId;
    if (!targetOutletId) return;

    try {
      setBalanceSheetLoading(true);
      const response = await axios.get(`${API_URL}/api/outlet-pos/cash-drawer-balance-sheet`, {
        headers: authHeaders(authToken),
        params: {
          outlet_id: targetOutletId,
          session_date: sessionDate || balanceSheetDate,
        },
        validateStatus: () => true,
      });

      if (response.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (response.status >= 400) {
        setDailyBalanceSheet(null);
        return;
      }

      const data = response.data?.data;
      setDailyBalanceSheet({
        session_date: data?.session_date || (sessionDate || balanceSheetDate),
        opening_balance: Number(data?.opening_balance || 0),
        closing_balance: Number(data?.closing_balance || 0),
        balance_difference: Number(data?.balance_difference || 0),
        total_sales: Number(data?.total_sales || 0),
        total_sales_amount: Number(data?.total_sales_amount || 0),
      });
    } catch (error) {
      console.error('Error loading daily balance sheet:', error);
      setDailyBalanceSheet(null);
    } finally {
      setBalanceSheetLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (hasLoadedDashboardRef.current) return;
    hasLoadedDashboardRef.current = true;

    const load = async () => {
      try {
        setLoading(true);
        await loadData(token);
      } catch (error: unknown) {
        console.error('Error loading outlet dashboard:', error);
        const apiError = error as { response?: { data?: { message?: string }; status?: number } };
        showAlertModal(apiError.response?.data?.message || 'Failed to load outlet dashboard.', 'Load Failed', 'error');
        if (apiError.response?.status === 401) {
          redirectToLoginWithNext();
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, API_URL, params, router]);

  const stockTotals = useMemo(() => {
    const totalItems = stocks.length;
    const totalAvailableQty = stocks.reduce((sum, line) => sum + Number(line.available_qty || 0), 0);
    return { totalItems, totalAvailableQty };
  }, [stocks]);

  const handleLogout = () => {
    const logoutNow = () => {
      localStorage.removeItem('token');
      router.push('/');
    };

    if (cashierSession?.is_open) {
      openConfirmModal(
        {
          title: 'Cashier Is Still Open',
          message: 'Please close the cashier before logout. Do you want to open Cash Drawer now?',
          confirmLabel: 'Go To Cash Drawer',
          cancelLabel: 'Cancel',
        },
        () => openEmbeddedPage('/outlet-pos/cash-drawer')
      );
      return;
    }

    openConfirmModal(
      {
        title: 'Confirm Logout',
        message: 'Are you sure you want to logout from this outlet?',
        confirmLabel: 'Logout',
        cancelLabel: 'Stay',
      },
      logoutNow
    );
  };

  const handleOpenOutletDay = async (openingAmount: number) => {
    if (!token) return;

    try {
      setDayToggleLoading(true);

      const response = await axios.post(
        `${API_URL}/api/outlet-pos/cash-drawer-open`,
        {
          opening_balance: openingAmount,
          opening_note: 'Day opened from sidebar',
        },
        {
          headers: authHeaders(token),
          validateStatus: () => true,
        }
      );

      if (response.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (response.status >= 400) {
        const errors = (response.data?.errors || {}) as Record<string, string[]>;
        const firstError = Object.values(errors)?.[0]?.[0];
        showAlertModal(firstError || response.data?.message || 'Failed to open outlet day.', 'Action Failed', 'error');
        return;
      }

      showAlertModal(response.data?.message || 'Outlet day opened successfully.', 'Done', 'success');
      await loadData(token);
      refreshEmbeddedPageIfOpen();
    } catch (error: unknown) {
      console.error('Error opening outlet day:', error);
      const apiError = error as { response?: { data?: { message?: string } } };
      showAlertModal(apiError.response?.data?.message || 'Failed to open outlet day.', 'Action Failed', 'error');
    } finally {
      setDayToggleLoading(false);
    }
  };

  const handleCloseOutletDay = async (options?: { transferToMainAccount?: boolean }) => {
    if (!token) return;

    const amount = Number(cashDrawer?.balance || 0);
    const payload = {
      closing_balance: amount,
      closing_note: 'Day closed from sidebar',
      transfer_to_main_account: Boolean(options?.transferToMainAccount),
    };

    try {
      setDayToggleLoading(true);

      const response = await axios.post(`${API_URL}/api/outlet-pos/cash-drawer-close`, payload, {
        headers: authHeaders(token),
        validateStatus: () => true,
      });

      if (response.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (response.status >= 400) {
        const errors = (response.data?.errors || {}) as Record<string, string[]>;
        const firstError = Object.values(errors)?.[0]?.[0];
        showAlertModal(firstError || response.data?.message || 'Failed to update outlet day status.', 'Action Failed', 'error');
        return;
      }

      showAlertModal(response.data?.message || 'Outlet day closed successfully.', 'Done', 'success');
      await loadData(token);
      refreshEmbeddedPageIfOpen();
    } catch (error: unknown) {
      console.error('Error closing outlet day:', error);
      const apiError = error as { response?: { data?: { message?: string } } };
      showAlertModal(apiError.response?.data?.message || 'Failed to update outlet day status.', 'Action Failed', 'error');
    } finally {
      setDayToggleLoading(false);
    }
  };

  const openOutletDayModal = () => {
    setOpenDayModal({
      open: true,
      openingAmount: Number(cashDrawer?.balance || 0).toFixed(2),
    });
  };

  const submitOpenOutletDay = async () => {
    const openingAmount = Number(openDayModal.openingAmount);
    if (!Number.isFinite(openingAmount) || openingAmount < 0) {
      showAlertModal('Please enter a valid opening amount (0 or higher).', 'Invalid Opening Amount', 'error');
      return;
    }

    setOpenDayModal((prev) => ({ ...prev, open: false }));
    await handleOpenOutletDay(openingAmount);
  };

  const openCloseOutletDayModal = () => {
    setCloseDayModal({
      open: true,
      transferToMainAccount: true,
    });
  };

  const submitCloseOutletDay = async () => {
    const transferToMainAccount = Boolean(closeDayModal.transferToMainAccount);
    setCloseDayModal((prev) => ({ ...prev, open: false }));
    await handleCloseOutletDay({ transferToMainAccount });
  };

  const salesTotals = useMemo(() => {
    const totalSales = sales.length;
    const totalQty = sales.reduce((sum, sale) => sum + Number(sale.total_quantity || 0), 0);
    const totalAmount = sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
    return { totalSales, totalQty, totalAmount };
  }, [sales]);

  const salesByDay = useMemo(() => {
    const map = new Map<string, number>();

    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }

    sales.forEach((sale) => {
      const key = String(sale.sale_date || '').slice(0, 10);
      if (map.has(key)) {
        map.set(key, Number(map.get(key) || 0) + Number(sale.total_amount || 0));
      }
    });

    const max = Math.max(...Array.from(map.values()), 1);
    return Array.from(map.entries()).map(([date, amount]) => ({
      date,
      label: new Date(date).toLocaleDateString(undefined, { weekday: 'short' }),
      amount,
      heightPct: Math.max(8, Math.round((amount / max) * 100)),
    }));
  }, [sales]);

  const topStocks = useMemo(() => {
    const top = [...stocks]
      .sort((a, b) => Number(b.available_qty || 0) - Number(a.available_qty || 0))
      .slice(0, 6);

    const max = Math.max(...top.map((line) => Number(line.available_qty || 0)), 1);

    return top.map((line) => ({
      ...line,
      widthPct: Math.max(10, Math.round((Number(line.available_qty || 0) / max) * 100)),
    }));
  }, [stocks]);

  const printSaleInvoice = (sale: SaleRow) => {
    if (typeof window === 'undefined') return;

    const items = Array.isArray(sale.items) ? sale.items : [];
    const subtotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const totalAmount = Number(sale.total_amount || 0);
    const discountAmount = Number(
      sale.discount_amount !== undefined && sale.discount_amount !== null
        ? sale.discount_amount
        : Math.max(subtotal - totalAmount, 0)
    );
    const paidAmount = Number(
      sale.paid_amount !== undefined && sale.paid_amount !== null
        ? sale.paid_amount
        : totalAmount
    );
    const balanceAmount = Number(
      sale.balance_amount !== undefined && sale.balance_amount !== null
        ? sale.balance_amount
        : Math.max(totalAmount - paidAmount, 0)
    );
    const paymentLabel = String(sale.payment_type || 'cash')
      .replace(/_/g, ' ')
      .toUpperCase();
    const bankAccountLine = paymentLabel.includes('BANK')
      ? String(sale.notes || '-')
      : '-';
    let companyName = 'PABASARA PRODUCTS';
    let companyAddress = '-';
    let companyPhone = '-';
    let companyEmail = '-';
    let companyLogo = '';
    try {
      const raw = window.localStorage.getItem('company_profile_data');
      if (raw) {
        const parsed = JSON.parse(raw) as {
          name?: string;
          address?: string;
          phone?: string;
          email?: string;
          logo_url?: string;
        };
        companyName = String(parsed?.name || companyName);
        companyAddress = String(parsed?.address || companyAddress);
        companyPhone = String(parsed?.phone || companyPhone);
        companyEmail = String(parsed?.email || companyEmail);
        companyLogo = String(parsed?.logo_url || '');
      }
    } catch {
      // keep fallback values
    }
    const isA4Print = receiptPaperWidth === 'A4';
    const printSheetSize = isA4Print ? 'A4' : 'auto';
    const printContentWidth = receiptPaperWidth === '58mm' ? '58mm' : receiptPaperWidth === '80mm' ? '80mm' : '100%';
    const customerCode = String(sale.loyalty_customer?.customer_code || '-');

    const rowsHtml = items.length > 0
      ? items.map((item, index) => `
          <tr>
            <td style="padding:6px;border:1px solid #e5e7eb;">${index + 1}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;">${String(item.item_code || '')}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;">${String(item.item_name || '')}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right;">${Number(item.quantity || 0).toFixed(2)}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right;">${Number(item.unit_price || 0).toFixed(2)}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right;">${Number(item.line_total || 0).toFixed(2)}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="6" style="padding:8px;border:1px solid #e5e7eb;text-align:center;">No item rows</td></tr>`;

    const printHtml = `
      <!doctype html>
      <html>
      <head>
        <title>Invoice ${sale.sale_number}</title>
        <style>
          @page {
            size: ${printSheetSize};
            margin: ${isA4Print ? '10mm' : '0'};
          }
        </style>
      </head>
      <body style="font-family:Arial,sans-serif;margin:0;padding:10px;color:#111827;">
        <div style="width:${printContentWidth};max-width:${isA4Print ? '190mm' : printContentWidth};margin:0 auto;font-size:${isA4Print ? '14px' : '12px'};line-height:1.4;">
          <div style="text-align:center;padding-bottom:8px;border-bottom:1px dashed #94a3b8;">
            ${companyLogo ? `<img src="${companyLogo}" alt="Company logo" style="max-height:46px;max-width:100%;object-fit:contain;" />` : ''}
            <div style="font-weight:700;font-size:16px;margin-top:6px;">${companyName}</div>
            <div>${companyAddress}</div>
            <div>Tel: ${companyPhone}</div>
            <div>${companyEmail}</div>
          </div>
          <div style="padding:8px 0;border-bottom:1px dashed #94a3b8;">
            <div><strong>Invoice:</strong> ${sale.sale_number}</div>
            <div><strong>Date:</strong> ${new Date(sale.sale_date).toLocaleString()}</div>
            <div><strong>Customer:</strong> ${sale.customer_name || '-'}</div>
            <div><strong>Code:</strong> ${customerCode}</div>
          </div>
          <div style="padding:8px 0;border-bottom:1px dashed #94a3b8;">
            <div style="font-weight:700;margin-bottom:4px;">BILLING ITEM DETAILS</div>
            ${rowsHtml}
          </div>
          <div style="padding:8px 0;border-bottom:1px dashed #94a3b8;">
            <div style="font-weight:700;margin-bottom:4px;">PAYMENT DETAILS</div>
            <div>${paymentLabel}</div>
            <div>Date: ${new Date(sale.sale_date).toLocaleString()}</div>
            <div>Bank: ${bankAccountLine}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:6px;">
            <tr><td>Subtotal</td><td style="text-align:right;">${subtotal.toFixed(2)}</td></tr>
            <tr><td>Discount</td><td style="text-align:right;">${discountAmount.toFixed(2)}</td></tr>
            <tr><td style="font-weight:700;">Total</td><td style="text-align:right;font-weight:700;">${totalAmount.toFixed(2)}</td></tr>
            <tr><td>Paid</td><td style="text-align:right;">${paidAmount.toFixed(2)}</td></tr>
            <tr><td>Outstanding</td><td style="text-align:right;">${balanceAmount.toFixed(2)}</td></tr>
          </table>
          <div style="padding-top:8px;margin-top:8px;border-top:1px dashed #94a3b8;text-align:center;font-weight:700;">Thank you</div>
        </div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 300);
    };

    const frameWindow = iframe.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) {
      cleanup();
      showAlertModal('Unable to prepare print layout. Please try again.', 'Print Failed', 'error');
      return;
    }

    frameDocument.open();
    frameDocument.write(printHtml);
    frameDocument.close();

    window.setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
      } catch {
        showAlertModal('Unable to start printing. Please try again.', 'Print Failed', 'error');
      } finally {
        cleanup();
      }
    }, 120);
  };

  const dailyReportSummary = useMemo(() => {
    if (!dailyBalanceSheet) {
      return {
        startBalance: 0,
        credit: 0,
        debit: 0,
        expectedBalance: 0,
        endBalance: 0,
        difference: 0,
      };
    }

    const startBalance = Number(dailyBalanceSheet.opening_balance || 0);
    const endBalance = Number(dailyBalanceSheet.closing_balance || 0);
    const movement = endBalance - startBalance;
    const credit = movement > 0 ? movement : 0;
    const debit = movement < 0 ? Math.abs(movement) : 0;
    const expectedBalance = startBalance + credit - debit;
    const difference = Number(dailyBalanceSheet.balance_difference || 0);

    return {
      startBalance,
      credit,
      debit,
      expectedBalance,
      endBalance,
      difference,
    };
  }, [dailyBalanceSheet]);

  const filteredLatestSales = useMemo(() => {
    const search = salesInvoiceSearch.trim().toLowerCase();
    const from = salesFromDate.trim();
    const to = salesToDate.trim();

    return sales.filter((sale) => {
      const saleNumberUpper = String(sale.sale_number || '').toUpperCase();
      const orderType = String(sale.order_type || '').toLowerCase();
      const source = String(sale.source || '').toLowerCase();
      const hasDoNumber = String(sale.do_number || '').trim() !== '';
      const isOrderOrDoRow =
        hasDoNumber ||
        source.includes('order') ||
        orderType.includes('order') ||
        saleNumberUpper.startsWith('ORD') ||
        saleNumberUpper.startsWith('DO');
      if (isOrderOrDoRow) return false;

      const saleNo = String(sale.sale_number || '').toLowerCase();
      if (search && !saleNo.includes(search)) return false;

      const saleDate = String(sale.sale_date || '').slice(0, 10);
      if (from && saleDate < from) return false;
      if (to && saleDate > to) return false;

      return true;
    });
  }, [sales, salesFromDate, salesInvoiceSearch, salesToDate]);

  const latestSalesTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredLatestSales.length / latestSalesPageSize)),
    [latestSalesPageSize, filteredLatestSales.length]
  );

  const safeLatestSalesPage = Math.min(latestSalesPage, latestSalesTotalPages);
  const latestSalesStartIndex = (safeLatestSalesPage - 1) * latestSalesPageSize;
  const latestSalesEndIndex = Math.min(latestSalesStartIndex + latestSalesPageSize, filteredLatestSales.length);

  const paginatedLatestSales = useMemo(
    () => filteredLatestSales.slice(latestSalesStartIndex, latestSalesEndIndex),
    [filteredLatestSales, latestSalesStartIndex, latestSalesEndIndex]
  );

  useEffect(() => {
    if (latestSalesPage > latestSalesTotalPages) {
      setLatestSalesPage(latestSalesTotalPages);
    }
  }, [latestSalesPage, latestSalesTotalPages]);

  useEffect(() => {
    setLatestSalesPage(1);
  }, [salesInvoiceSearch, salesFromDate, salesToDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
      </div>

      <div className="relative z-10 flex min-h-screen">
        {mobileSidebarOpen ? (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            aria-label="Close sidebar overlay"
          />
        ) : null}

        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-rose-100 bg-white/95 shadow-xl backdrop-blur-md transition-all duration-300 lg:translate-x-0 ${
            mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}`}
        >
          <div className="flex h-16 items-center gap-3 border-b border-rose-100 px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-lg text-white shadow-md shadow-rose-200">
              🏪
            </div>
            {!sidebarCollapsed ? (
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Outlet POS</h2>
                <p className="text-xs text-slate-500">{outletCode || '-'}</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-1 p-3">
            {sidebarItems.map((item) => {
              const active = embeddedPath ? embeddedPath === item.href : pathname === item.href;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    openEmbeddedPage(item.href);
                    setMobileSidebarOpen(false);
                  }}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-200'
                      : 'text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                  }`}
                  title={item.label}
                >
                  <span className="text-base">{item.icon}</span>
                  {!sidebarCollapsed ? <span>{item.label}</span> : null}
                </button>
              );
            })}

            {!sidebarCollapsed ? (
              <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-600">Outlet Day</p>
                <p className={`mt-1 text-xs font-semibold ${cashierSession?.is_open ? 'text-emerald-700' : cashierSession?.is_closed ? 'text-blue-700' : 'text-amber-700'}`}>
                  {cashierSession?.is_open ? 'OPEN' : cashierSession?.is_closed ? 'CLOSED' : 'NOT OPEN'}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Balance: {Number(cashDrawer?.balance || 0).toFixed(2)}</p>
                <button
                  type="button"
                  onClick={() => {
                    const isOpen = Boolean(cashierSession?.is_open);
                    if (isOpen) {
                      openCloseOutletDayModal();
                      return;
                    }
                    openOutletDayModal();
                  }}
                  disabled={dayToggleLoading}
                  className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                    cashierSession?.is_open
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {dayToggleLoading
                    ? 'Please wait...'
                    : cashierSession?.is_open
                    ? 'Close Outlet Day'
                    : cashierSession?.is_closed
                    ? 'Reopen Outlet Day'
                    : 'Open Outlet Day'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="absolute bottom-4 left-0 right-0 px-3">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="hidden w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 lg:flex"
            >
              {sidebarCollapsed ? 'Expand' : 'Collapse Sidebar'}
            </button>
          </div>
        </aside>

        <div className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
          <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
            <div className="w-full px-[30px]">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setMobileSidebarOpen(true)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-700 lg:hidden"
                    aria-label="Open sidebar"
                  >
                    ☰
                  </button>
                  <div>
                    <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Outlet POS Dashboard</h1>
                    <p className="text-xs text-gray-600">{outletName} ({outletCode})</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md text-sm font-medium hover:from-rose-600 hover:to-pink-600"
                >
                  Logout
                </button>
              </div>
              <div className="pb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEmbeddedPage('/outlet-pos/create-sale')}
                  className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md text-sm font-medium hover:from-rose-600 hover:to-pink-600"
                >
                  Go To Create Sale
                </button>
                <button
                  type="button"
                  onClick={() => openEmbeddedPage('/outlet-pos/sales')}
                  className="px-4 py-2 border border-pink-200 bg-pink-50 text-pink-700 rounded-md text-sm font-medium hover:bg-pink-100"
                >
                  Open Sales Records
                </button>
                <button
                  type="button"
                  onClick={() => openEmbeddedPage('/outlet-pos/cash-drawer')}
                  className="px-4 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-md text-sm font-medium hover:bg-emerald-100"
                >
                  Set Cash Drawer
                </button>
                <button
                  type="button"
                  onClick={() => openEmbeddedPage('/outlet-pos/stock')}
                  className="px-4 py-2 border border-rose-200 bg-rose-50 text-rose-700 rounded-md text-sm font-medium hover:bg-rose-100"
                >
                  View Stock
                </button>
                <button
                  type="button"
                  onClick={() => openEmbeddedPage('/outlet-pos/loyalty-customers')}
                  className="px-4 py-2 border border-amber-200 bg-amber-50 text-amber-700 rounded-md text-sm font-medium hover:bg-amber-100"
                >
                  Loyalty Customers
                </button>
              </div>
            </div>
          </nav>

      <main className="w-full py-8 px-[30px] space-y-6">
        {embeddedPath ? (
          <div className="relative min-h-[80vh] w-full overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-xl">
            {embeddedLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
              </div>
            ) : null}
            <iframe
              ref={embeddedFrameRef}
              src={embeddedSrc}
              title={`Outlet POS Embedded Page - ${embeddedPath}`}
              onLoad={() => {
                setEmbeddedLoading(false);
                cleanEmbeddedFrameUi();
              }}
              className="h-[80vh] w-full bg-white"
            />
          </div>
        ) : (
          <>
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Items In Store</div>
            <div className="text-2xl font-bold text-gray-900">{stockTotals.totalItems}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Available Qty</div>
            <div className="text-2xl font-bold text-gray-900">{stockTotals.totalAvailableQty.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Recent Sales</div>
            <div className="text-2xl font-bold text-gray-900">{salesTotals.totalSales}</div>
          </div>
          <div className="rounded-xl border border-white/60 bg-white/85 backdrop-blur-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Recent Sales Amount</div>
            <div className="text-2xl font-bold text-gray-900">{salesTotals.totalAmount.toFixed(2)}</div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Pending Transfers To Main Account</h3>
              <p className="text-sm text-gray-600">Requests created at outlet day closing when transfer is selected.</p>
            </div>
          </div>
          {pendingTransfers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              No pending transfer records.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Date</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total Sale</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Start Amount</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Card Collection</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Bank Transfer Total</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cash Collection</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Requested At</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Requested By</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {pendingTransfers.map((row) => (
                    <tr key={row.id}>
                      <td className="px-4 py-2 text-sm text-slate-700">{row.session_date}</td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-slate-900">{Number(row.total_sale || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-slate-900">{Number(row.start_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-slate-900">{Number(row.card_collection_total || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-slate-900">{Number(row.bank_transfer_total || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-slate-900">{Number(row.cash_collection_total || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-slate-700">
                        {row.requested_at ? new Date(row.requested_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-right font-semibold text-slate-900">{Number(row.amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm">
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase text-amber-700">
                          {row.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-700">{row.requested_by_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Daily Balance Sheet</h3>
              <p className="text-sm text-gray-600">Credit = received cash (increase). Debit = transfer cash (decrease) from the cash drawer balance.</p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Session Date</label>
                <input
                  type="date"
                  value={balanceSheetDate}
                  onChange={(e) => setBalanceSheetDate(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
                />
              </div>
              <button
                type="button"
                onClick={() => loadDailyBalanceSheet(token, outletId, balanceSheetDate)}
                disabled={balanceSheetLoading || !outletId}
                className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-md text-sm font-medium hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
              >
                {balanceSheetLoading ? 'Loading...' : 'Get Balance Sheet'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="text-xs text-gray-500">Start Balance</div>
              <div className="text-lg font-bold text-emerald-700">{dailyReportSummary.startBalance.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-4">
              <div className="text-xs text-gray-500">Credit</div>
              <div className="text-lg font-bold text-cyan-700">{dailyReportSummary.credit.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
              <div className="text-xs text-gray-500">Debit</div>
              <div className="text-lg font-bold text-orange-700">{dailyReportSummary.debit.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs text-gray-500">Expected Balance</div>
              <div className="text-lg font-bold text-slate-900">{dailyReportSummary.expectedBalance.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="text-xs text-gray-500">Current Balance</div>
              <div className="text-lg font-bold text-indigo-700">{dailyReportSummary.endBalance.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-4">
              <div className="text-xs text-gray-500">Difference</div>
              <div className="text-lg font-bold text-rose-700">{dailyReportSummary.difference.toFixed(2)}</div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Sales Trend (Last 7 Days)</h3>
            <p className="text-sm text-gray-600 mb-4">Based on loaded POS sales amounts.</p>
            <div className="h-48 rounded-xl bg-gradient-to-b from-pink-50 to-rose-50 border border-pink-100 px-3 py-4">
              <div className="h-full flex items-end justify-between gap-2">
                {salesByDay.map((point) => (
                  <div key={point.date} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1">
                    <div className="w-full bg-gradient-to-t from-rose-500 to-pink-400 rounded-t-md" style={{ height: `${point.heightPct}%` }}></div>
                    <div className="text-[11px] text-gray-600">{point.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Top Available Stock</h3>
            <p className="text-sm text-gray-600 mb-4">Highest available quantities at this outlet.</p>
            <div className="space-y-3">
              {topStocks.length === 0 ? (
                <div className="text-sm text-gray-500">No available stock for this outlet.</div>
              ) : (
                topStocks.map((line) => (
                  <div key={line.inventory_item_id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-700 font-medium">{line.code} - {line.name}</span>
                      <span className="text-rose-700 font-semibold">{Number(line.available_qty).toFixed(2)} {line.unit}</span>
                    </div>
                    <div className="h-2 rounded-full bg-rose-100">
                      <div className="h-2 rounded-full bg-gradient-to-r from-rose-500 to-pink-500" style={{ width: `${line.widthPct}%` }}></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 backdrop-blur-lg shadow-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Latest Sales Snapshot</h3>
            <Link
              href={getPathWithCode('/outlet-pos/sales')}
              className="text-sm text-pink-700 hover:text-pink-800 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Search Invoice / Sale No</label>
              <input
                type="text"
                value={salesInvoiceSearch}
                onChange={(e) => setSalesInvoiceSearch(e.target.value)}
                placeholder="Enter invoice or sale no..."
                className="w-full rounded-md border border-pink-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">From Date</label>
              <input
                type="date"
                value={salesFromDate}
                onChange={(e) => setSalesFromDate(e.target.value)}
                className="w-full rounded-md border border-pink-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">To Date</label>
              <input
                type="date"
                value={salesToDate}
                onChange={(e) => setSalesToDate(e.target.value)}
                className="w-full rounded-md border border-pink-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-100"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sale #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {paginatedLatestSales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No sales found.</td>
                  </tr>
                ) : (
                  paginatedLatestSales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="px-4 py-2 text-sm text-gray-800">{sale.sale_number}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{new Date(sale.sale_date).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{sale.customer_name || '-'}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-700">{Number(sale.total_quantity).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900 font-semibold">{Number(sale.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoiceSale(sale)}
                            className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            View Invoice
                          </button>
                          <button
                            type="button"
                            onClick={() => printSaleInvoice(sale)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Print
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-pink-100 bg-pink-50/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              Showing {filteredLatestSales.length === 0 ? 0 : latestSalesStartIndex + 1} to {latestSalesEndIndex} of {filteredLatestSales.length} sales
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Rows</label>
                <select
                  value={latestSalesPageSize}
                  onChange={(e) => {
                    setLatestSalesPageSize(Number(e.target.value));
                    setLatestSalesPage(1);
                  }}
                  className="rounded-md border border-pink-200 bg-white px-2 py-1 text-sm text-gray-700"
                >
                  <option value={5}>5</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLatestSalesPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeLatestSalesPage <= 1}
                  className="rounded-full border border-pink-200 bg-white px-3 py-1 text-xs font-semibold text-pink-700 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm font-semibold text-gray-700">
                  Page {safeLatestSalesPage} of {latestSalesTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setLatestSalesPage((prev) => Math.min(latestSalesTotalPages, prev + 1))}
                  disabled={safeLatestSalesPage >= latestSalesTotalPages}
                  className="rounded-full border border-pink-200 bg-white px-3 py-1 text-xs font-semibold text-pink-700 transition hover:bg-pink-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
          </>
        )}
      </main>
        </div>
      </div>

      {confirmModal.open ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">{confirmModal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{confirmModal.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirmModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {confirmModal.cancelLabel}
              </button>
              <button
                type="button"
                onClick={confirmModalAction}
                className="rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-rose-600 hover:to-pink-600"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openDayModal.open ? (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">{cashierSession?.is_closed ? 'Reopen Outlet Day' : 'Open Outlet Day'}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {cashierSession?.is_closed
                ? 'Set a new opening amount to reopen cashier for the same day.'
                : 'Set the opening cash drawer amount for this day. Use the physical starting cash counted at shift start.'}
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Opening Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openDayModal.openingAmount}
                onChange={(e) => setOpenDayModal((prev) => ({ ...prev, openingAmount: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-4 focus:ring-rose-100"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenDayModal((prev) => ({ ...prev, open: false }))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void submitOpenOutletDay();
                }}
                className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-emerald-700 hover:to-teal-700"
              >
                {cashierSession?.is_closed ? 'Reopen Day' : 'Open Day'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {closeDayModal.open ? (
        <div className="fixed inset-0 z-[126] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Close Outlet Day</h3>
            <p className="mt-2 text-sm text-slate-600">
              Do you want to create a transfer request to company main account for today&apos;s closing balance?
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              Closing Balance: {Number(cashDrawer?.balance || 0).toFixed(2)}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Outlet Total Business</span>
                <span className="font-semibold text-slate-900">{Number(dayPaymentSummary?.outlet_total_business || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Cash Collection Total</span>
                <span className="font-semibold text-emerald-700">{Number(dayPaymentSummary?.cash_collection_total || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Bank Transfer Total</span>
                <span className="font-semibold text-blue-700">{Number(dayPaymentSummary?.bank_transfer_total || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600">Card Payment Total</span>
                <span className="font-semibold text-violet-700">{Number(dayPaymentSummary?.card_payment_total || 0).toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCloseDayModal((prev) => ({ ...prev, transferToMainAccount: true }))}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  closeDayModal.transferToMainAccount
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Yes, Transfer Pending
              </button>
              <button
                type="button"
                onClick={() => setCloseDayModal((prev) => ({ ...prev, transferToMainAccount: false }))}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  !closeDayModal.transferToMainAccount
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                No, Close Only
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloseDayModal((prev) => ({ ...prev, open: false }))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void submitCloseOutletDay();
                }}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-blue-700 hover:to-indigo-700"
              >
                Close Day
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {alertModal.open ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <h3
              className={`text-lg font-semibold ${
                alertModal.tone === 'error'
                  ? 'text-rose-700'
                  : alertModal.tone === 'success'
                  ? 'text-emerald-700'
                  : 'text-slate-900'
              }`}
            >
              {alertModal.title}
            </h3>
            <p className="mt-2 text-sm text-slate-600">{alertModal.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setAlertModal((prev) => ({ ...prev, open: false }))}
                className="rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-rose-600 hover:to-pink-600"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedInvoiceSale ? (
        <div className="fixed inset-0 z-[128] flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">POS Receipt Preview</h3>
                <p className="text-sm text-slate-500">Choose the receipt size before printing.</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={receiptPaperWidth}
                  onChange={(e) => {
                    const value = e.target.value;
                    setReceiptPaperWidth(value === '58mm' || value === 'A4' ? value : '80mm');
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
                >
                  <option value="80mm">80mm roll</option>
                  <option value="58mm">58mm roll</option>
                  <option value="A4">A4 size</option>
                </select>
                <button
                  type="button"
                  onClick={() => printSaleInvoice(selectedInvoiceSale)}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceSale(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="bg-slate-100 px-5 py-5">
              <div className={`mx-auto rounded-xl border border-slate-200 bg-white p-4 text-black shadow ${
                receiptPaperWidth === '58mm'
                  ? 'max-w-[360px]'
                  : receiptPaperWidth === 'A4'
                  ? 'max-w-[900px]'
                  : 'max-w-[500px]'
              }`}>
                <div className="border-b border-dashed border-slate-300 pb-2 text-center">
                  <p className="text-lg font-bold text-black">{String((typeof window !== 'undefined' && JSON.parse(window.localStorage.getItem('company_profile_data') || '{}')?.name) || 'PABASARA PRODUCTS')}</p>
                  <p className="text-xs text-black">{String((typeof window !== 'undefined' && JSON.parse(window.localStorage.getItem('company_profile_data') || '{}')?.address) || '-')}</p>
                  <p className="text-xs text-black">Tel: {String((typeof window !== 'undefined' && JSON.parse(window.localStorage.getItem('company_profile_data') || '{}')?.phone) || '-')}</p>
                </div>
                <div className="border-b border-dashed border-slate-300 py-2 text-xs text-black">
                  <p><span className="font-semibold">Invoice:</span> {selectedInvoiceSale.sale_number}</p>
                  <p><span className="font-semibold">Date:</span> {new Date(selectedInvoiceSale.sale_date).toLocaleString()}</p>
                  <p><span className="font-semibold">Customer:</span> {selectedInvoiceSale.customer_name || '-'}</p>
                  <p><span className="font-semibold">Code:</span> {selectedInvoiceSale.loyalty_customer?.customer_code || '-'}</p>
                </div>
                <div className="border-b border-dashed border-slate-300 py-2">
                  <p className="mb-1 text-xs font-bold text-black">BILLING ITEM DETAILS</p>
                  <div className="space-y-2">
                    {(selectedInvoiceSale.items || []).map((item) => (
                      <div key={item.id} className="text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-black">{item.item_name || item.item_code || '-'}</span>
                          <span className="font-semibold text-black">{Number(item.line_total || 0).toFixed(2)}</span>
                        </div>
                        <div className="text-black">
                          {Number(item.quantity || 0).toFixed(2)} x {Number(item.unit_price || 0).toFixed(2)} / {item.unit || 'pcs'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-b border-dashed border-slate-300 py-2 text-xs text-black">
                  <p className="mb-1 font-bold text-black">PAYMENT DETAILS</p>
                  <p className="font-semibold text-black">{String(selectedInvoiceSale.payment_type || 'cash').replace(/_/g, ' ').toUpperCase()}</p>
                  <p className="text-black">Date: {new Date(selectedInvoiceSale.sale_date).toLocaleString()}</p>
                  <p className="text-black">Bank: {String(selectedInvoiceSale.payment_type || '').toLowerCase().includes('bank') ? String(selectedInvoiceSale.notes || '-') : '-'}</p>
                </div>
                <div className="py-2 text-sm text-black">
                  <div className="flex items-center justify-between"><span>Subtotal</span><span className="font-semibold">{((selectedInvoiceSale.items || []).reduce((sum, item) => sum + Number(item.line_total || 0), 0)).toFixed(2)}</span></div>
                  <div className="flex items-center justify-between"><span>Discount</span><span className="font-semibold">{Number(selectedInvoiceSale.discount_amount || 0).toFixed(2)}</span></div>
                  <div className="flex items-center justify-between text-base font-bold"><span>Total</span><span>{Number(selectedInvoiceSale.total_amount || 0).toFixed(2)}</span></div>
                  <div className="flex items-center justify-between"><span>Paid</span><span className="font-semibold">{Number(selectedInvoiceSale.paid_amount || selectedInvoiceSale.total_amount || 0).toFixed(2)}</span></div>
                  <div className="flex items-center justify-between"><span>Outstanding</span><span className="font-semibold">{Number(selectedInvoiceSale.balance_amount || 0).toFixed(2)}</span></div>
                </div>
                <div className="border-t border-dashed border-slate-300 pt-2 text-center text-sm font-bold text-black">
                  Thank you
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OutletPosDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
        </div>
      }
    >
      <OutletPosDashboardContent />
    </Suspense>
  );
}
