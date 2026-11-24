'use client';

import PageSkeleton from '@/app/components/PageSkeleton';
import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/http';
import { useOutletEmbeddedBridge } from '../useOutletEmbeddedBridge';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const COMPANY_PROFILE_ID_KEY = 'company_profile_id';
const LOYALTY_POINT_RATE = 0.01;

const normalizePhone = (value: string): string => String(value || '').replace(/\D+/g, '');
const isLikelyPhone = (value: string): boolean => normalizePhone(value).length >= 7;

const normalizeCompanyLogoUrl = (rawUrl?: string, rawPath?: string): string => {
  const url = String(rawUrl || '').trim();
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const logoPath = String(rawPath || '').trim();
  if (logoPath) {
    return `/storage/${logoPath.replace(/^\/+/, '')}`;
  }
  if (!url) return '';

  if (url.startsWith('/storage/')) {
    return url;
  }

  return url;
};

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

type LoadRecord = {
  id: number;
  load_number: string;
  status?: string | null;
  load_date?: string | null;
  delivery_date?: string | null;
  route?: {
    id?: number;
    route_name?: string | null;
    name?: string | null;
    code?: string | null;
  } | null;
  vehicle?: {
    id?: number;
    vehicle_no?: string | null;
    vehicle_number?: string | null;
    registration_number?: string | null;
  } | null;
  driver?: {
    id?: number;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
  } | null;
};

type SaleItem = {
  id: number;
  item_code: string;
  item_name: string;
  issue_type?: 'free' | 'sample' | 'retail' | 'wholesale' | 'van_sale';
  discount_amount?: number;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type SaleRow = {
  id: number;
  sale_number: string;
  do_number?: string | null;
  status?: string | null;
  delivery_employee_id?: number | null;
  delivery_employee_name?: string | null;
  load_id?: number | null;
  sale_date: string;
  customer_name?: string;
  total_quantity: number;
  total_amount: number;
  discount_amount?: number;
  paid_amount?: number;
  payment_type?: 'cash' | 'bank' | 'card' | 'voucher' | null;
  balance_amount?: number;
  items: SaleItem[];
};

type CartLine = {
  row_id: string;
  inventory_item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  issue_type: 'free' | 'sample' | 'retail' | 'wholesale' | 'van_sale';
  discount_amount: number;
  base_unit_price: number;
  quantity: number;
  unit_price: number;
};

type OutletProfile = {
  id?: number;
  name?: string;
  code?: string;
};

type CreatedSale = {
  id: number;
  sale_number: string;
  do_number?: string | null;
  order_type?: 'outlet_order' | 'factory_order' | null;
  status?: string | null;
  delivery_employee_id?: number | null;
  delivery_employee_name?: string | null;
  load_id?: number | null;
  sale_date: string;
  customer_name?: string | null;
  notes?: string | null;
  total_quantity: number;
  total_amount: number;
  discount_amount?: number;
  paid_amount?: number;
  payment_type?: 'cash' | 'bank' | 'card' | 'voucher' | null;
  balance_amount?: number;
  items?: SaleItem[];
  outlet?: { name?: string; code?: string } | null;
  loyalty_points_awarded?: number;
  loyalty_customer_id?: number | null;
  loyalty_customer?: { id: number; customer_code: string; name: string; phone: string } | null;
};

type LoyaltyCustomer = {
  id: number;
  customer_code: string;
  name: string;
  phone: string;
  email?: string | null;
  points_balance?: number;
  status?: string;
};

type DistributionCustomer = {
  id: number;
  customer_code: string;
  shop_name: string;
  owner_name?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string;
};

type RouteOption = {
  id: number;
  name: string;
  origin?: string | null;
  destination?: string | null;
};

type CustomerSuggestion = {
  source: 'distribution' | 'loyalty';
  id: number;
  code: string;
  name: string;
  phone: string;
  email?: string | null;
};

type CashierSessionStatus = {
  is_open: boolean;
  is_closed: boolean;
  needs_open: boolean;
  session_date?: string;
};

type CompanyBankAccount = {
  id: number;
  bank_name?: string;
  branch?: string;
  account_no?: string;
  current_balance?: number;
};

type SaleMode = 'order' | 'get_order' | 'exact_invoice';

const ISSUE_TYPE_OPTIONS: Array<{ value: 'free' | 'sample' | 'retail' | 'wholesale' | 'van_sale'; label: string }> = [
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'van_sale', label: 'Van Sale' },
  { value: 'free', label: 'Free' },
  { value: 'sample', label: 'Sample' },
];

const formatIssueTypeLabel = (value: string): string => {
  const map: Record<string, string> = {
    free: 'Free',
    sample: 'Sample',
    retail: 'Retail',
    wholesale: 'Wholesale',
    van_sale: 'Van Sale',
  };
  return map[value] || value;
};

const computeEffectiveUnitPrice = (
  basePrice: number,
  issueType: 'free' | 'sample' | 'retail' | 'wholesale' | 'van_sale',
  discountAmount: number
): number => {
  if (issueType === 'free' || issueType === 'sample') return 0;
  const safeBase = Number.isFinite(basePrice) ? Math.max(basePrice, 0) : 0;
  const safeDiscount = Number.isFinite(discountAmount) ? Math.max(discountAmount, 0) : 0;
  return Math.max(safeBase - safeDiscount, 0);
};

function OutletPosContent() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [outletName, setOutletName] = useState('');
  const [outletCode, setOutletCode] = useState('');
  const [outletId, setOutletId] = useState<number | null>(null);
  const [stocks, setStocks] = useState<StockLine[]>([]);
  const [inventoryCatalog, setInventoryCatalog] = useState<StockLine[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [saleDate, setSaleDate] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0.00');
  const [paidAmount, setPaidAmount] = useState('0.00');
  const [paymentType, setPaymentType] = useState<'cash' | 'bank' | 'card' | 'voucher'>('cash');
  const [companyBankAccounts, setCompanyBankAccounts] = useState<CompanyBankAccount[]>([]);
  const [selectedCompanyBankAccountId, setSelectedCompanyBankAccountId] = useState<number>(0);
  const [message, setMessage] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<number>(0);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number>(-1);
  const [selectedQty, setSelectedQty] = useState<string>('1');
  const [selectedPrice, setSelectedPrice] = useState<string>('0');
  const [selectedIssueType, setSelectedIssueType] = useState<'free' | 'sample' | 'retail' | 'wholesale' | 'van_sale'>('retail');
  const [selectedLineDiscount, setSelectedLineDiscount] = useState<string>('0');
  const [saleMode, setSaleMode] = useState<SaleMode>('order');
  const [getOrderType, setGetOrderType] = useState<'outlet_order' | 'factory_order'>('outlet_order');
  const [lastCreatedSale, setLastCreatedSale] = useState<CreatedSale | null>(null);
    const [loads, setLoads] = useState<LoadRecord[]>([]);
    const [selectedLoadId, setSelectedLoadId] = useState<number>(0);
  const [loyaltyCustomers, setLoyaltyCustomers] = useState<LoyaltyCustomer[]>([]);
  const [distributionCustomers, setDistributionCustomers] = useState<DistributionCustomer[]>([]);
  const [distributionRoutes, setDistributionRoutes] = useState<RouteOption[]>([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [showCustomerRegisterModal, setShowCustomerRegisterModal] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [loyaltySearch, setLoyaltySearch] = useState('');
  const [selectedLoyaltyCustomerId, setSelectedLoyaltyCustomerId] = useState<number>(0);
  const [showLoyaltySuggestions, setShowLoyaltySuggestions] = useState(false);
  const [creatingLoyaltyFromCustomerPhone, setCreatingLoyaltyFromCustomerPhone] = useState(false);
  const [customerFormData, setCustomerFormData] = useState<{
    shop_name: string;
    customer_code: string;
    owner_name: string;
    phone: string;
    address: string;
    route_id: string;
    outstanding: string;
    status: 'active' | 'inactive';
  }>({
    shop_name: '',
    customer_code: '',
    owner_name: '',
    phone: '',
    address: '',
    route_id: '',
    outstanding: '',
    status: 'active',
  });
  const [cashierSession, setCashierSession] = useState<CashierSessionStatus | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const [companyProfileName, setCompanyProfileName] = useState('Company');
  const [companyProfileLogoUrl, setCompanyProfileLogoUrl] = useState('');
  const [companyProfileAddress, setCompanyProfileAddress] = useState('');
  const [companyProfilePhone, setCompanyProfilePhone] = useState('');
  const [companyProfileEmail, setCompanyProfileEmail] = useState('');
  const [companyProfileWebsite, setCompanyProfileWebsite] = useState('');
  const customerInputRef = useRef<HTMLInputElement>(null);
  const itemSearchInputRef = useRef<HTMLInputElement>(null);
  const itemSuggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  const router = useRouter();
  const params = useSearchParams();
  const isEmbedded = params.get('embedded') === '1';
  const initialLoadTokenRef = useRef('');
  useOutletEmbeddedBridge(isEmbedded, loading);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  const formInputClass =
    'w-full rounded-xl border border-rose-100 bg-white/95 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none';
  const formInputClassCompact =
    'w-full rounded-xl border border-rose-100 bg-white/95 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 focus:outline-none';

  const paymentTypeLabel = (value: 'cash' | 'bank' | 'card' | 'voucher') => {
    if (value === 'bank') return 'BANK TRANSFER';
    return value.toUpperCase();
  };

  const getPathWithCode = (path: string) => {
    const outletCode = params.get('outlet_code') || '';
    const query = new URLSearchParams();
    if (outletCode) query.set('outlet_code', outletCode);
    if (isEmbedded) query.set('embedded', '1');
    const queryString = query.toString();
    return `${path}${queryString ? `?${queryString}` : ''}`;
  };

  const getNextPath = () => {
    return getPathWithCode('/outlet-pos/create-sale');
  };

  const authHeaders = (authToken: string) => ({ Authorization: `Bearer ${authToken}` });

  const getLocalIsoDate = (): string => {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10);
  };

  const generateCustomerCode = (): string => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const datePart = `${now.getFullYear().toString().slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `CUS-${datePart}${timePart}-${randomPart}`;
  };

  const todayIsoDate = getLocalIsoDate();

  const redirectToLoginWithNext = () => {
    localStorage.removeItem('token');
    router.push(`/?next=${encodeURIComponent(getNextPath())}`);
  };

  const showNotice = (message: string, title = 'Notice') => {
    setNoticeModal({ isOpen: true, title, message });
  };

  useEffect(() => {
    if (!message) return;
    setNoticeModal({ isOpen: true, title: 'Notice', message });
    setMessage('');
  }, [message]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const invalidStoredToken = !storedToken || storedToken === 'undefined' || storedToken === 'null';

    if (invalidStoredToken) {
      router.push(`/?next=${encodeURIComponent(getNextPath())}`);
      return;
    }
    setToken(storedToken);
  }, [router, params]);

  const fetchOutletStock = async (authToken: string): Promise<{ ok: boolean; profile?: OutletProfile }> => {
    const res = await axios.get(`${API_URL}/api/outlet-pos/me`, {
      headers: authHeaders(authToken),
      validateStatus: () => true,
    });

    if (res.status === 401) {
      redirectToLoginWithNext();
      return { ok: false };
    }

    if (res.status >= 400) {
      setMessage(res.data?.message || 'Failed to load outlet profile.');
      return { ok: false };
    }

    const payload = res.data?.data;
    const outlet = payload?.outlet;

    if (!outlet) {
      redirectToLoginWithNext();
      return { ok: false };
    }

    setStocks((payload?.stocks || []).filter((line: StockLine) => Number(line.available_qty) > 0));

    const expectedCode = (params.get('outlet_code') || '').trim();
    if (expectedCode && outlet.code && expectedCode.toLowerCase() !== String(outlet.code).toLowerCase()) {
      setMessage(`Link was for outlet ${expectedCode}, but you are logged in to ${outlet.code}.`);
    }

    return { ok: true, profile: { id: outlet.id, name: outlet.name, code: outlet.code } };
  };

  const fetchOutletSales = async (authToken: string): Promise<boolean> => {
    const res = await axios.get(`${API_URL}/api/outlet-pos/sales`, {
      headers: authHeaders(authToken),
      params: { per_page: 50, from_date: todayIsoDate, to_date: todayIsoDate },
      validateStatus: () => true,
    });

    if (res.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (res.status >= 400) {
      setMessage(res.data?.message || 'Failed to load outlet sales.');
      setSales([]);
      return false;
    }

    const rows = res.data?.data?.data || [];
    setSales(rows);
    return true;
  };

  const fetchLoyaltyCustomers = async (authToken: string, outletIdValue: number): Promise<boolean> => {
    const allRows: LoyaltyCustomer[] = [];
    const perPage = 200;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const res = await axios.get(`${API_URL}/api/outlet-pos/loyalty-customers`, {
        headers: authHeaders(authToken),
        params: { outlet_id: outletIdValue, per_page: perPage, page },
        validateStatus: () => true,
      });

      if (res.status === 401) {
        redirectToLoginWithNext();
        return false;
      }

      if (res.status >= 400) {
        setLoyaltyCustomers([]);
        return false;
      }

      const payload = res.data?.data;
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      allRows.push(...rows);

      const apiLastPage = Number(payload?.last_page || 0);
      totalPages = apiLastPage > 0 ? apiLastPage : 1;

      if (apiLastPage <= 0 && rows.length < perPage) break;
      page += 1;
    }

    setLoyaltyCustomers(allRows);
    return true;
  };

  const fetchDistributionCustomers = async (authToken: string): Promise<boolean> => {
    const allRows: DistributionCustomer[] = [];
    const perPage = 200;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const res = await axios.get(`${API_URL}/api/distribution/customers`, {
        headers: authHeaders(authToken),
        params: { per_page: perPage, page, status: 'active' },
        validateStatus: () => true,
      });

      if (res.status === 401) {
        redirectToLoginWithNext();
        return false;
      }

      if (res.status >= 400) {
        setDistributionCustomers([]);
        return false;
      }

      const payload = res.data?.data;
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      allRows.push(...rows);

      const apiLastPage = Number(payload?.last_page || 0);
      totalPages = apiLastPage > 0 ? apiLastPage : 1;

      if (apiLastPage <= 0 && rows.length < perPage) break;
      page += 1;
    }

    setDistributionCustomers(allRows);
    return true;
  };

  const fetchDistributionRoutes = async (authToken: string): Promise<boolean> => {
    const res = await axios.get(`${API_URL}/api/vehicle-loading/routes`, {
      headers: authHeaders(authToken),
      validateStatus: () => true,
    });

    if (res.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (res.status >= 400) {
      setDistributionRoutes([]);
      return false;
    }

    const payload = res.data;
    const rows: RouteOption[] = Array.isArray(payload) ? payload : (payload?.data || []);
    setDistributionRoutes(rows.filter((route) => Number(route?.id || 0) > 0));
    return true;
  };

  const resetCustomerForm = () => {
    setCustomerFormData({
      shop_name: customerName.trim(),
      customer_code: generateCustomerCode(),
      owner_name: '',
      phone: isLikelyPhone(customerName) ? normalizePhone(customerName) : '',
      address: '',
      route_id: '',
      outstanding: '',
      status: 'active',
    });
  };

  const openCustomerRegisterModal = async () => {
    if (!token) return;
    resetCustomerForm();
    setShowCustomerRegisterModal(true);
    if (distributionRoutes.length === 0) {
      await fetchDistributionRoutes(token);
    }
  };

  const handleRegisterCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      setSavingCustomer(true);
      const payload = {
        ...customerFormData,
        route_id: customerFormData.route_id ? Number(customerFormData.route_id) : null,
        outstanding: Number(customerFormData.outstanding || 0),
      };

      const res = await axios.post(`${API_URL}/api/distribution/customers`, payload, {
        headers: authHeaders(token),
        validateStatus: () => true,
      });

      if (res.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (res.status >= 400) {
        const apiMessage = res.data?.message || 'Failed to create customer.';
        showNotice(apiMessage, 'Customer Registration');
        return;
      }

      await fetchDistributionCustomers(token);
      setCustomerName(customerFormData.shop_name.trim());
      setShowCustomerSuggestions(false);
      setShowCustomerRegisterModal(false);
      resetCustomerForm();
      showNotice('Customer registered successfully.', 'Customer Registration');
    } catch (error) {
      console.error('Failed to register customer:', error);
      showNotice('Failed to register customer.', 'Customer Registration');
    } finally {
      setSavingCustomer(false);
    }
  };

  const fetchInventoryCatalog = async (authToken: string): Promise<boolean> => {
    const allRows: StockLine[] = [];
    const perPage = 200;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const res = await axios.get(`${API_URL}/api/stock/inventory`, {
        headers: authHeaders(authToken),
        params: { per_page: perPage, page, status: 'active' },
        validateStatus: () => true,
      });

      if (res.status === 401) {
        redirectToLoginWithNext();
        return false;
      }

      if (res.status >= 400) {
        setInventoryCatalog([]);
        return false;
      }

      const payload = res.data?.data;
      const rows: Array<{
        id?: number | string;
        name?: string;
        code?: string;
        unit?: string;
        sell_price?: number | string;
        unit_price?: number | string;
        current_stock?: number | string;
      }> = Array.isArray(payload?.data) ? payload.data : [];
      allRows.push(
        ...rows
          .map((row) => ({
            inventory_item_id: Number(row?.id || 0),
            name: String(row?.name || ''),
            code: String(row?.code || ''),
            unit: String(row?.unit || ''),
            sell_price: Number(row?.sell_price ?? row?.unit_price ?? 0),
            transferred_qty: 0,
            sold_qty: 0,
            available_qty: Number(row?.current_stock ?? 0),
          }))
          .filter((row) => row.inventory_item_id > 0 && row.name)
      );

      const apiLastPage = Number(payload?.last_page || 0);
      totalPages = apiLastPage > 0 ? apiLastPage : 1;
      if (apiLastPage <= 0 && rows.length < perPage) break;
      page += 1;
    }

    const uniqueByItemId = new Map<number, StockLine>();
    allRows.forEach((row) => {
      if (!uniqueByItemId.has(row.inventory_item_id)) {
        uniqueByItemId.set(row.inventory_item_id, row);
      }
    });
    setInventoryCatalog(Array.from(uniqueByItemId.values()));
    return true;
  };

  const fetchLoads = async (authToken: string): Promise<boolean> => {
    const res = await axios.get(`${API_URL}/api/vehicle-loading/loads`, {
      headers: authHeaders(authToken),
      params: { status: 'active' },
      validateStatus: () => true,
    });

    if (res.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (res.status >= 400) {
      setLoads([]);
      return false;
    }

    const payload = res.data;
    const rows: any[] = Array.isArray(payload)
      ? payload
      : (payload?.data?.data || payload?.data || []);

    const normalizedLoads = rows
      .map((row) => ({
        id: Number(row?.id || 0),
        load_number: String(row?.load_number || ''),
        status: row?.status ?? null,
        load_date: row?.load_date ?? null,
        delivery_date: row?.delivery_date ?? null,
        route: row?.route ?? null,
        vehicle: row?.vehicle ?? null,
        driver: row?.driver ?? null,
      }) as LoadRecord)
      .filter((row) => {
        if (!(row.id > 0 && row.load_number)) return false;
        const normalizedStatus = String(row.status || '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '_');
        return !normalizedStatus.includes('deliver');
      });

    setLoads(normalizedLoads);
    return true;
  };

  const refreshOutletData = async (authToken: string): Promise<boolean> => {
    const stockResult = await fetchOutletStock(authToken);
    if (!stockResult.ok) return false;

    setOutletName(stockResult.profile?.name || 'Outlet');
    setOutletCode(stockResult.profile?.code || '-');
    const outletIdValue = stockResult.profile?.id || null;
    setOutletId(outletIdValue);

    const statusRes = await axios.get(`${API_URL}/api/outlet-pos/cash-drawer-status`, {
      headers: authHeaders(authToken),
      validateStatus: () => true,
    });

    if (statusRes.status === 401) {
      redirectToLoginWithNext();
      return false;
    }

    if (statusRes.status < 400) {
      setCashierSession(statusRes.data?.data?.session || null);
    }

    if (outletIdValue) {
      await fetchLoyaltyCustomers(authToken, outletIdValue);
    }

    await fetchDistributionCustomers(authToken);
    await fetchInventoryCatalog(authToken);
    await fetchLoads(authToken);

    const salesOk = await fetchOutletSales(authToken);
    return salesOk;
  };

  useEffect(() => {
    if (selectedLoadId === 0) return;
    const exists = loads.some((row) => row.id === selectedLoadId);
    if (!exists) {
      setSelectedLoadId(0);
    }
  }, [loads, selectedLoadId]);

  useEffect(() => {
    if (saleMode !== 'order' && selectedLoadId !== 0) {
      setSelectedLoadId(0);
    }
  }, [saleMode, selectedLoadId]);

  useEffect(() => {
    if (saleMode !== 'get_order' && getOrderType !== 'outlet_order') {
      setGetOrderType('outlet_order');
    }
  }, [saleMode, getOrderType]);

  useEffect(() => {
    if (!token) return;
    // Load once per token; guards against repeat runs (StrictMode / identity changes) that re-show the loader.
    if (initialLoadTokenRef.current === token) return;
    initialLoadTokenRef.current = token;

    const load = async () => {
      try {
        setLoading(true);
        await refreshOutletData(token);
      } catch (error: any) {
        console.error('Error loading outlet POS:', error);
        const serverMessage = error?.response?.data?.message || 'Failed to load outlet POS.';
        setMessage(serverMessage);
        if (error?.response?.status === 401) {
          redirectToLoginWithNext();
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, API_URL]);

  useEffect(() => {
    if (loading) return;

    const timerId = window.setTimeout(() => {
      customerInputRef.current?.focus();
      customerInputRef.current?.select();
    }, 120);

    return () => window.clearTimeout(timerId);
  }, [loading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem('company_profile_data');
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        name?: string;
        logo_url?: string;
        logo_path?: string;
        address?: string;
        phone?: string;
        email?: string;
        website?: string;
      };

      const name = String(parsed?.name || '').trim();
      if (name) {
        setCompanyProfileName(name);
      }

      setCompanyProfileAddress(String(parsed?.address || '').trim());
      setCompanyProfilePhone(String(parsed?.phone || '').trim());
      setCompanyProfileEmail(String(parsed?.email || '').trim());
      setCompanyProfileWebsite(String(parsed?.website || '').trim());

      const normalizedLogoUrl = normalizeCompanyLogoUrl(parsed?.logo_url, parsed?.logo_path);
      if (normalizedLogoUrl) {
        setCompanyProfileLogoUrl(normalizedLogoUrl);
      }
    } catch (error) {
      console.error('Failed to load company profile for bill header:', error);
    }
  }, []);

  useEffect(() => {
    if (!token || typeof window === 'undefined') return;

    const hydrateCompanyHeader = async () => {
      try {
        const profileId = Number(window.localStorage.getItem(COMPANY_PROFILE_ID_KEY) || 0);
        const listRes = await axios.get('/api/companies', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const listPayload = listRes?.data;
        const companies = (
          Array.isArray(listPayload)
            ? listPayload
            : (Array.isArray(listPayload?.data) ? listPayload.data : [])
        ) as Array<{
          id?: number | string;
          name?: string;
          logo_url?: string;
          logo_path?: string;
          address?: string;
          phone?: string;
          email?: string;
          website?: string;
          bank_accounts?: Array<{
            id?: number;
            bank_name?: string;
            branch?: string;
            account_no?: string;
            current_balance?: number;
          }>;
        }>;

        let company = (companies.find((row) => Number(row?.id || 0) === profileId) || null);
        if (!company) {
          company = companies.find((row) => Array.isArray(row?.bank_accounts) && row.bank_accounts.length > 0) || companies[0] || null;
        }
        if (!company) return;

        const resolvedCompanyId = Number(company?.id || 0);
        if (resolvedCompanyId > 0) {
          try {
            const detailRes = await axios.get(`/api/companies/${resolvedCompanyId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const detailPayload = detailRes?.data;
            const detailCompany = (detailPayload?.data && typeof detailPayload.data === 'object')
              ? detailPayload.data
              : detailPayload;
            if (detailCompany && typeof detailCompany === 'object') {
              company = {
                ...company,
                ...detailCompany,
              };
            }
          } catch {
            // Keep list payload fallback.
          }
        }

        const latestName = String(company?.name || '').trim();
        if (latestName) {
          setCompanyProfileName(latestName);
        }

        const latestLogoUrl = normalizeCompanyLogoUrl(company?.logo_url, company?.logo_path);
        setCompanyProfileLogoUrl(latestLogoUrl);
        setCompanyProfileAddress(String(company?.address || '').trim());
        setCompanyProfilePhone(String(company?.phone || '').trim());
        setCompanyProfileEmail(String(company?.email || '').trim());
        setCompanyProfileWebsite(String(company?.website || '').trim());
        const bankAccounts = Array.isArray(company?.bank_accounts) ? company.bank_accounts : [];

        const mappedBankAccounts: CompanyBankAccount[] = bankAccounts
          .map((account) => ({
            id: Number(account?.id || 0),
            bank_name: String(account?.bank_name || ''),
            branch: String(account?.branch || ''),
            account_no: String(account?.account_no || ''),
            current_balance: Number(account?.current_balance || 0),
          }))
          .filter((account) => account.id > 0);
        setCompanyBankAccounts(mappedBankAccounts);
        setSelectedCompanyBankAccountId((prev) => {
          if (mappedBankAccounts.some((account) => account.id === prev)) return prev;
          return mappedBankAccounts[0]?.id || 0;
        });

        const currentRaw = window.localStorage.getItem('company_profile_data');
        const current = currentRaw ? JSON.parse(currentRaw) : {};
        const merged = {
          ...current,
          ...company,
          logo_url: latestLogoUrl,
        };
        window.localStorage.setItem('company_profile_data', JSON.stringify(merged));
      } catch (error) {
        console.error('Failed to refresh company profile for bill header:', error);
      }
    };

    hydrateCompanyHeader();
  }, [token]);

  useEffect(() => {
    if (paymentType !== 'bank') return;
    if (companyBankAccounts.length === 0) {
      showNotice('No company bank accounts found. Please add bank account in Company Main Account.', 'Bank Transfer');
      return;
    }

    setSelectedCompanyBankAccountId((prev) => {
      if (companyBankAccounts.some((account) => account.id === prev)) return prev;
      return companyBankAccounts[0]?.id || 0;
    });
  }, [paymentType, companyBankAccounts]);

  const stockTotals = useMemo(() => {
    const totalItems = stocks.length;
    const totalAvailableQty = stocks.reduce((sum, line) => sum + Number(line.available_qty || 0), 0);
    return { totalItems, totalAvailableQty };
  }, [stocks]);

  const salesTotals = useMemo(() => {
    const totalSales = sales.length;
    const totalQty = sales.reduce((sum, sale) => sum + Number(sale.total_quantity || 0), 0);
    const totalAmount = sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
    return { totalSales, totalQty, totalAmount };
  }, [sales]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0);
  }, [cart]);

  const selectedEffectiveUnitPrice = useMemo(() => {
    return computeEffectiveUnitPrice(
      Number(selectedPrice || 0),
      selectedIssueType,
      Number(selectedLineDiscount || 0)
    );
  }, [selectedPrice, selectedIssueType, selectedLineDiscount]);

  const effectiveDiscountAmount = useMemo(() => {
    const raw = Number(discountAmount || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return Math.min(raw, cartTotal);
  }, [discountAmount, cartTotal]);

  const lineDiscountTotalAmount = useMemo(() => {
    return cart.reduce(
      (sum, line) => sum + Number(line.discount_amount || 0) * Number(line.quantity || 0),
      0
    );
  }, [cart]);

  const totalDiscountAmount = useMemo(() => {
    return lineDiscountTotalAmount + effectiveDiscountAmount;
  }, [lineDiscountTotalAmount, effectiveDiscountAmount]);

  const payableTotal = useMemo(() => {
    return Math.max(cartTotal - effectiveDiscountAmount, 0);
  }, [cartTotal, effectiveDiscountAmount]);

  const effectivePaidAmount = useMemo(() => {
    const raw = Number(paidAmount || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw;
  }, [paidAmount]);

  const balanceAmount = useMemo(() => {
    return Math.max(payableTotal - effectivePaidAmount, 0);
  }, [payableTotal, effectivePaidAmount]);

  const selectableItems = useMemo(() => {
    return saleMode === 'get_order' ? inventoryCatalog : stocks;
  }, [saleMode, inventoryCatalog, stocks]);

  const filteredStocks = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();
    if (!term) return selectableItems.slice(0, 12);

    return selectableItems
      .filter((line) => {
        const text = `${line.code} ${line.name} ${line.unit}`.toLowerCase();
        return text.includes(term);
      })
      .slice(0, 12);
  }, [selectableItems, itemSearch]);

  const filteredLoyaltyCustomers = useMemo(() => {
    const term = loyaltySearch.trim().toLowerCase();
    if (!term) return loyaltyCustomers.slice(0, 12);

    return loyaltyCustomers
      .filter((c) => `${c.customer_code} ${c.name} ${c.phone} ${c.email || ''}`.toLowerCase().includes(term))
      .slice(0, 12);
  }, [loyaltyCustomers, loyaltySearch]);

  const customerSuggestions = useMemo<CustomerSuggestion[]>(() => {
    const distributionRows = distributionCustomers.map((customer) => ({
      source: 'distribution' as const,
      id: customer.id,
      code: String(customer.customer_code || '-'),
      name: String(customer.shop_name || customer.owner_name || 'Unknown Customer').trim(),
      phone: String(customer.phone || '').trim(),
      email: customer.email || null,
    }));

    const loyaltyRows = loyaltyCustomers.map((customer) => ({
      source: 'loyalty' as const,
      id: customer.id,
      code: String(customer.customer_code || '-'),
      name: String(customer.name || 'Unknown Customer').trim(),
      phone: String(customer.phone || '').trim(),
      email: customer.email || null,
    }));

    if (saleMode === 'order' || saleMode === 'get_order') {
      return distributionRows;
    }

    return [...distributionRows, ...loyaltyRows];
  }, [distributionCustomers, loyaltyCustomers, saleMode]);

  const filteredCustomerSuggestions = useMemo(() => {
    const term = customerName.trim().toLowerCase();
    if (!term) return customerSuggestions.slice(0, 12);

    return customerSuggestions
      .filter((customer) => (`${customer.code} ${customer.name} ${customer.phone} ${customer.email || ''}`).toLowerCase().includes(term))
      .slice(0, 12);
  }, [customerName, customerSuggestions]);

  const matchedLoyaltyByCustomerPhone = useMemo(() => {
    if (saleMode !== 'exact_invoice') return null;
    if (!isLikelyPhone(customerName)) return null;
    const phoneDigits = normalizePhone(customerName);
    return loyaltyCustomers.find((c) => normalizePhone(c.phone) === phoneDigits) || null;
  }, [saleMode, customerName, loyaltyCustomers]);

  const selectedLoyaltyCustomer = useMemo(() => {
    return loyaltyCustomers.find((c) => c.id === selectedLoyaltyCustomerId) || null;
  }, [loyaltyCustomers, selectedLoyaltyCustomerId]);

  const selectedLoad = useMemo(() => {
    return loads.find((row) => row.id === selectedLoadId) || null;
  }, [loads, selectedLoadId]);

  const loyaltyPointsPreview = useMemo(() => {
    if (!selectedLoyaltyCustomerId) return 0;
    return Number((payableTotal * LOYALTY_POINT_RATE).toFixed(2));
  }, [payableTotal, selectedLoyaltyCustomerId]);

  const canQuickCreateLoyaltyFromCustomerPhone = useMemo(() => {
    return Boolean(
      saleMode === 'exact_invoice' &&
      token &&
      outletId &&
      customerName.trim() &&
      isLikelyPhone(customerName) &&
      !matchedLoyaltyByCustomerPhone
    );
  }, [saleMode, token, outletId, customerName, matchedLoyaltyByCustomerPhone]);

  useEffect(() => {
    if (saleMode !== 'exact_invoice') {
      if (selectedLoyaltyCustomerId !== 0) {
        setSelectedLoyaltyCustomerId(0);
      }
      if (loyaltySearch) {
        setLoyaltySearch('');
      }
      if (showLoyaltySuggestions) {
        setShowLoyaltySuggestions(false);
      }
      return;
    }

    const raw = customerName.trim();
    if (!raw) {
      if (selectedLoyaltyCustomerId !== 0) {
        setSelectedLoyaltyCustomerId(0);
      }
      return;
    }

    if (!isLikelyPhone(raw)) return;
    if (!matchedLoyaltyByCustomerPhone) return;

    if (selectedLoyaltyCustomerId !== matchedLoyaltyByCustomerPhone.id) {
      setSelectedLoyaltyCustomerId(matchedLoyaltyByCustomerPhone.id);
      setLoyaltySearch(`${matchedLoyaltyByCustomerPhone.customer_code} - ${matchedLoyaltyByCustomerPhone.name}`);
    }
  }, [saleMode, customerName, matchedLoyaltyByCustomerPhone, selectedLoyaltyCustomerId, loyaltySearch, showLoyaltySuggestions]);

  useEffect(() => {
    if (!showItemSuggestions) {
      setHighlightedSuggestionIndex(-1);
      return;
    }

    if (filteredStocks.length === 0) {
      setHighlightedSuggestionIndex(-1);
      return;
    }

    setHighlightedSuggestionIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= filteredStocks.length) return filteredStocks.length - 1;
      return prev;
    });
  }, [filteredStocks, showItemSuggestions]);

  useEffect(() => {
    if (!showItemSuggestions) return;
    if (highlightedSuggestionIndex < 0) return;

    const current = itemSuggestionRefs.current[highlightedSuggestionIndex];
    current?.scrollIntoView({ block: 'nearest' });
  }, [highlightedSuggestionIndex, showItemSuggestions]);

  const selectStockItem = (line: StockLine) => {
    setSelectedItemId(line.inventory_item_id);
    setItemSearch(`${line.code} - ${line.name}`);
    setSelectedPrice(Number(line.sell_price || 0).toFixed(2));
    setShowItemSuggestions(false);
    setHighlightedSuggestionIndex(-1);
    setTimeout(() => qtyInputRef.current?.focus(), 0);
  };

  const handleItemSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showItemSuggestions && e.key === 'Enter') {
      if (filteredStocks.length > 0) {
        e.preventDefault();
        selectStockItem(filteredStocks[0]);
      }
      return;
    }

    if (!showItemSuggestions && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      if (filteredStocks.length > 0) {
        setShowItemSuggestions(true);
        setHighlightedSuggestionIndex(0);
      }
      e.preventDefault();
      return;
    }

    if (!showItemSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredStocks.length === 0) return;
      setHighlightedSuggestionIndex((prev) => {
        const next = prev + 1;
        return next >= filteredStocks.length ? 0 : next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredStocks.length === 0) return;
      setHighlightedSuggestionIndex((prev) => {
        const next = prev <= 0 ? filteredStocks.length - 1 : prev - 1;
        return next;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (filteredStocks.length > 0) {
        e.preventDefault();
        const idx = highlightedSuggestionIndex >= 0 ? highlightedSuggestionIndex : 0;
        const item = filteredStocks[idx];
        if (item) {
          selectStockItem(item);
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setShowItemSuggestions(false);
      setHighlightedSuggestionIndex(-1);
    }
  };

  const addToCart = (): boolean => {
    const stockLine = selectableItems.find((s) => s.inventory_item_id === selectedItemId);
    if (!stockLine) {
      showNotice('Please select an item.');
      return false;
    }

    const qty = Number(selectedQty || 0);
    const basePrice = Number(selectedPrice || 0);
    const lineDiscount = Number(selectedLineDiscount || 0);
    const effectivePrice = computeEffectiveUnitPrice(basePrice, selectedIssueType, lineDiscount);

    if (qty <= 0) {
      showNotice('Quantity must be greater than zero.');
      return false;
    }

    if (saleMode !== 'get_order' && qty > Number(stockLine.available_qty || 0)) {
      showNotice('Quantity exceeds available stock.');
      return false;
    }

    if (lineDiscount < 0) {
      showNotice('Discount must be zero or greater.');
      return false;
    }

    const currentQtyForItem = cart
      .filter((line) => line.inventory_item_id === stockLine.inventory_item_id)
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);

    if (saleMode !== 'get_order' && currentQtyForItem + qty > Number(stockLine.available_qty || 0)) {
      showNotice('Combined quantity exceeds available stock.');
      return false;
    }

    const normalizedBasePrice = Number(basePrice.toFixed(2));
    const normalizedDiscount = selectedIssueType === 'free' || selectedIssueType === 'sample'
      ? Number(basePrice.toFixed(2))
      : Number(Math.max(lineDiscount, 0).toFixed(2));
    const normalizedUnitPrice = Number(effectivePrice.toFixed(2));

    setCart((prev) => {
      const existingIndex = prev.findIndex((line) => (
        line.inventory_item_id === stockLine.inventory_item_id
        && line.issue_type === selectedIssueType
        && Number(line.base_unit_price) === normalizedBasePrice
        && Number(line.discount_amount) === normalizedDiscount
        && Number(line.unit_price) === normalizedUnitPrice
      ));

      if (existingIndex >= 0) {
        return prev.map((line, index) => (
          index === existingIndex
            ? { ...line, quantity: Number((Number(line.quantity || 0) + qty).toFixed(2)) }
            : line
        ));
      }

      return [
        ...prev,
        {
          row_id: `${stockLine.inventory_item_id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          inventory_item_id: stockLine.inventory_item_id,
          item_code: stockLine.code,
          item_name: stockLine.name,
          unit: stockLine.unit,
          issue_type: selectedIssueType,
          discount_amount: normalizedDiscount,
          base_unit_price: normalizedBasePrice,
          quantity: qty,
          unit_price: normalizedUnitPrice,
        },
      ];
    });

    setSelectedQty('1');
    setSelectedLineDiscount('0');
    setSelectedPrice('0');
    setItemSearch('');
    setSelectedItemId(0);
    setShowItemSuggestions(false);
    setHighlightedSuggestionIndex(-1);
    return true;
  };

  const handleCustomerInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    if (showCustomerSuggestions && filteredCustomerSuggestions.length > 0) {
      const first = filteredCustomerSuggestions[0];
      if (first) {
        setCustomerName(first.name);
        if (saleMode === 'exact_invoice' && first.source === 'loyalty') {
          const selected = loyaltyCustomers.find((customer) => customer.id === first.id);
          if (selected) {
            setSelectedLoyaltyCustomerId(selected.id);
            setLoyaltySearch(`${selected.customer_code} - ${selected.name}`);
          }
        } else {
          setSelectedLoyaltyCustomerId(0);
        }
        setShowCustomerSuggestions(false);
      }
    }

    itemSearchInputRef.current?.focus();
    setShowItemSuggestions(true);
  };

  const selectCustomerSuggestion = (customer: CustomerSuggestion) => {
    setCustomerName(customer.name);
    if (saleMode === 'exact_invoice' && customer.source === 'loyalty') {
      const selected = loyaltyCustomers.find((row) => row.id === customer.id);
      if (selected) {
        setSelectedLoyaltyCustomerId(selected.id);
        setLoyaltySearch(`${selected.customer_code} - ${selected.name}`);
      }
    } else {
      setSelectedLoyaltyCustomerId(0);
    }
    setShowCustomerSuggestions(false);
    setTimeout(() => itemSearchInputRef.current?.focus(), 0);
  };

  const handleAddToCartKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.code !== 'NumpadEnter') return;
    e.preventDefault();
    const added = addToCart();
    if (added) {
      setTimeout(() => itemSearchInputRef.current?.focus(), 0);
    }
  };

  const removeFromCart = (rowId: string) => {
    setCart((prev) => prev.filter((line) => line.row_id !== rowId));
  };

  const selectLoyaltyCustomer = (customer: LoyaltyCustomer) => {
    setSelectedLoyaltyCustomerId(customer.id);
    setLoyaltySearch(`${customer.customer_code} - ${customer.name}`);
    setShowLoyaltySuggestions(false);
    if (!customerName.trim()) {
      setCustomerName(customer.name);
    }
  };

  const clearLoyaltyCustomer = () => {
    setSelectedLoyaltyCustomerId(0);
    setLoyaltySearch('');
  };

  const quickCreateLoyaltyFromCustomerPhone = async () => {
    if (!token || !outletId) return;

    const rawInput = customerName.trim();
    const phone = normalizePhone(rawInput);
    if (phone.length < 7) {
      showNotice('Enter a valid phone number in Customer Name field.');
      return;
    }

    const hasLetters = /[A-Za-z]/.test(rawInput);
    const loyaltyName = hasLetters ? rawInput : `Customer ${phone}`;

    try {
      setCreatingLoyaltyFromCustomerPhone(true);

      const res = await axios.post(
        `${API_URL}/api/outlet-pos/loyalty-customers`,
        {
          outlet_id: outletId,
          name: loyaltyName,
          phone,
        },
        { headers: authHeaders(token), validateStatus: () => true }
      );

      if (res.status === 401) {
        redirectToLoginWithNext();
        return;
      }

      if (res.status >= 400) {
        const apiMessage = res.data?.message || 'Failed to create loyalty customer.';
        const validationErrors = (res.data?.errors || {}) as Record<string, string[]>;
        const firstError = Object.values(validationErrors)?.[0]?.[0];
        showNotice(firstError || apiMessage, 'Validation');
        return;
      }

      const created = res.data?.data as LoyaltyCustomer | undefined;
      if (created?.id) {
        setLoyaltyCustomers((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
        setSelectedLoyaltyCustomerId(created.id);
        setLoyaltySearch(`${created.customer_code} - ${created.name}`);
        setMessage(`Loyalty customer created for phone ${created.phone}.`);
      }
    } catch (error) {
      console.error('Failed to create loyalty customer from customer field phone:', error);
      showNotice('Failed to create loyalty customer.');
    } finally {
      setCreatingLoyaltyFromCustomerPhone(false);
    }
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const imageUrlToDataUrl = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const getCompanyProfileForPrint = async (): Promise<{
    name: string;
    address: string;
    phone: string;
    website: string;
    email: string;
    logoUrl: string;
    logoCandidates: string[];
  }> => {
    let profile: {
      name?: string;
      logo_url?: string;
      logo_path?: string;
      address?: string;
      phone?: string;
      email?: string;
      website?: string;
    } = {
      name: companyProfileName,
      logo_url: companyProfileLogoUrl,
      address: companyProfileAddress,
      phone: companyProfilePhone,
      email: companyProfileEmail,
      website: companyProfileWebsite,
    };

    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('company_profile_data');
        if (raw) {
          const localProfile = JSON.parse(raw);
          profile = { ...profile, ...localProfile };
        }
      } catch {
        // Keep fallback values.
      }
    }

    let fetchedCompany: Record<string, any> | null = null;

    try {
      const profileId = typeof window !== 'undefined'
        ? Number(window.localStorage.getItem(COMPANY_PROFILE_ID_KEY) || 0)
        : 0;
      if (token && profileId > 0) {
        const res = await axios.get(`/api/companies/${profileId}`, {
          headers: authHeaders(token),
          validateStatus: () => true,
        });
        if (res.status >= 200 && res.status < 300) {
          const payload = (res.data?.data && typeof res.data.data === 'object') ? res.data.data : res.data;
          fetchedCompany = (payload && typeof payload === 'object') ? payload : null;
        }
      }

      if (!fetchedCompany && token) {
        const listRes = await axios.get('/api/companies', {
          headers: authHeaders(token),
          params: { per_page: 1 },
          validateStatus: () => true,
        });

        if (listRes.status >= 200 && listRes.status < 300) {
          const rows = Array.isArray(listRes.data)
            ? listRes.data
            : (listRes.data?.data || []);
          const firstCompany = Array.isArray(rows) ? rows[0] : null;
          if (firstCompany && typeof firstCompany === 'object') {
            fetchedCompany = firstCompany;
          }
        }
      }

      if (fetchedCompany) {
        profile = { ...profile, ...fetchedCompany };
      }
    } catch {
      // Keep previously resolved values.
    }

    const normalizedLogo = normalizeCompanyLogoUrl(profile.logo_url, profile.logo_path);
    const logoCandidates = Array.from(new Set([
      normalizedLogo,
      normalizedLogo && normalizedLogo.startsWith('/') && typeof window !== 'undefined'
        ? `${window.location.origin}${normalizedLogo}`
        : '',
      normalizedLogo && normalizedLogo.startsWith('/')
        ? `${API_URL.replace(/\/+$/, '')}${normalizedLogo}`
        : '',
      String(profile.logo_url || '').trim(),
    ].filter(Boolean)));

    const preferredLogoUrl = logoCandidates[0] || '';

    return {
      name: String(profile.name || '').trim() || 'Company',
      address: String(profile.address || '').trim(),
      phone: String(profile.phone || '').trim(),
      website: String(profile.website || '').trim(),
      email: String(profile.email || '').trim(),
      logoUrl: preferredLogoUrl,
      logoCandidates,
    };
  };

  const getImageFormatFromDataUrl = (dataUrl: string): 'PNG' | 'JPEG' => {
    const header = String(dataUrl || '').slice(0, 64).toLowerCase();
    if (header.includes('image/jpeg') || header.includes('image/jpg')) {
      return 'JPEG';
    }
    return 'PNG';
  };

  const printCustomerBill = async (sale: CreatedSale, mode: SaleMode) => {
    const isDoInvoice = mode === 'order' || Boolean(sale.do_number);
    const printWindow = window.open('', '_blank', isDoInvoice ? 'width=1024,height=900' : 'width=420,height=760');
    if (!printWindow) {
      showNotice('Unable to open print window. Please allow popups.');
      return;
    }

    const company = await getCompanyProfileForPrint();

    const lines = Array.isArray(sale.items) ? sale.items : [];
    const lineRows = lines
      .map((line) => {
        const qty = Number(line.quantity || 0).toFixed(2);
        const price = Number(line.unit_price || 0).toFixed(2);
        const total = Number(line.line_total || Number(line.quantity || 0) * Number(line.unit_price || 0)).toFixed(2);
        return `
          <tr>
            <td>${escapeHtml(`${line.item_code || '-'} - ${line.item_name || '-'}`)}</td>
            <td style="text-align:right;">${qty}</td>
            <td style="text-align:right;">${escapeHtml(formatIssueTypeLabel(line.issue_type || 'retail'))}</td>
            <td style="text-align:right;">${Number(line.discount_amount || 0).toFixed(2)}</td>
            <td style="text-align:right;">${price}</td>
            <td style="text-align:right;">${total}</td>
          </tr>
        `;
      })
      .join('');

    const saleDate = sale.sale_date ? new Date(sale.sale_date).toLocaleString() : new Date().toLocaleString();
    const customer = sale.customer_name?.trim() ? sale.customer_name : 'Walk-in Customer';
    const outletDisplay = `${sale.outlet?.name || outletName || 'Outlet'} (${sale.outlet?.code || outletCode || '-'})`;
    const subtotal = Number(sale.total_amount || 0) + Number(sale.discount_amount || 0);

    if (isDoInvoice) {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      let cursorY = 44;
      let logoDataUrl: string | null = null;
      for (const candidate of company.logoCandidates) {
        logoDataUrl = await imageUrlToDataUrl(candidate);
        if (logoDataUrl) break;
      }
      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, getImageFormatFromDataUrl(logoDataUrl), 40, cursorY - 4, 56, 56);
        } catch {
          // If image type is not PNG or cannot be read, continue without blocking PDF generation.
        }
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(company.name, 110, cursorY + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const companyLines = [
        company.address,
        company.phone ? `Tel: ${company.phone}` : '',
        company.email,
        company.website,
      ].filter(Boolean);

      let companyLineY = cursorY + 28;
      companyLines.slice(0, 4).forEach((line) => {
        doc.text(line, 110, companyLineY);
        companyLineY += 13;
      });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('DISPATCH ORDER REPORT', pageWidth - 40, cursorY + 12, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Reference #: ${sale.sale_number || '-'}`, pageWidth - 40, cursorY + 30, { align: 'right' });
      if (sale.do_number) {
        doc.text(`Dispatch Order #: ${sale.do_number}`, pageWidth - 40, cursorY + 44, { align: 'right' });
      }
      doc.text(`Date: ${saleDate}`, pageWidth - 40, cursorY + 58, { align: 'right' });

      cursorY = 120;

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(40, cursorY, pageWidth - 80, 68, 6, 6, 'F');
      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(40, cursorY, pageWidth - 80, 68, 6, 6, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Customer / Outlet', 52, cursorY + 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Name: ${customer}`, 52, cursorY + 35);
      doc.text(`Outlet: ${outletDisplay}`, 52, cursorY + 50);

      doc.text(`Payment: ${String(sale.payment_type || 'cash').toUpperCase()}`, pageWidth - 52, cursorY + 35, { align: 'right' });
      doc.text(`Status: ${String(sale.status || 'completed').toUpperCase()}`, pageWidth - 52, cursorY + 50, { align: 'right' });

      const bodyRows = lines.map((line, index) => [
        String(index + 1),
        `${line.item_code || '-'} - ${line.item_name || '-'}`,
        formatIssueTypeLabel(line.issue_type || 'retail'),
        Number(line.quantity || 0).toFixed(2),
        Number(line.unit_price || 0).toFixed(2),
        Number(line.discount_amount || 0).toFixed(2),
        Number(line.line_total || Number(line.quantity || 0) * Number(line.unit_price || 0)).toFixed(2),
      ]);

      autoTable(doc, {
        startY: cursorY + 82,
        head: [['#', 'Item', 'Issue', 'Qty', 'Price', 'Discount', 'Amount']],
        body: bodyRows.length > 0 ? bodyRows : [['', 'No line items', '', '', '', '', '']],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, valign: 'middle' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 22 },
          2: { halign: 'center', cellWidth: 56 },
          3: { halign: 'right', cellWidth: 48 },
          4: { halign: 'right', cellWidth: 58 },
          5: { halign: 'right', cellWidth: 64 },
          6: { halign: 'right', cellWidth: 66 },
        },
        margin: { left: 40, right: 40 },
      });

      const finalY = (doc as any).lastAutoTable?.finalY || cursorY + 300;
      const totalsX = pageWidth - 240;
      let totalsY = finalY + 18;

      doc.setDrawColor(220, 220, 220);
      doc.roundedRect(totalsX, totalsY - 14, 200, 106, 6, 6, 'S');
      doc.setFontSize(10);
      doc.text('Total Qty', totalsX + 10, totalsY);
      doc.text(Number(sale.total_quantity || 0).toFixed(2), totalsX + 190, totalsY, { align: 'right' });
      totalsY += 16;
      doc.text('Subtotal', totalsX + 10, totalsY);
      doc.text(subtotal.toFixed(2), totalsX + 190, totalsY, { align: 'right' });
      totalsY += 16;
      doc.text('Discount', totalsX + 10, totalsY);
      doc.text(Number(sale.discount_amount || 0).toFixed(2), totalsX + 190, totalsY, { align: 'right' });
      totalsY += 16;
      doc.setFont('helvetica', 'bold');
      doc.text('Grand Total', totalsX + 10, totalsY);
      doc.text(Number(sale.total_amount || 0).toFixed(2), totalsX + 190, totalsY, { align: 'right' });
      totalsY += 16;
      doc.setFont('helvetica', 'normal');
      doc.text('Paid', totalsX + 10, totalsY);
      doc.text(Number(sale.paid_amount || 0).toFixed(2), totalsX + 190, totalsY, { align: 'right' });
      totalsY += 16;
      doc.text('Balance', totalsX + 10, totalsY);
      doc.text(Number(sale.balance_amount || 0).toFixed(2), totalsX + 190, totalsY, { align: 'right' });

      doc.setFontSize(10);
      doc.text(`Notes: ${(sale.notes || '').trim() || '-'}`, 40, Math.max(totalsY + 22, finalY + 34));

      const pdfUrl = doc.output('bloburl').toString();
      printWindow.location.href = pdfUrl;
      return;
    }

    const html = `
      <html>
        <head>
          <title>Bill ${escapeHtml(sale.sale_number || '')}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: "DM Sans", sans-serif;
              margin: 0;
              padding: 8px;
              color: #111;
              font-size: 11px;
            }
            .receipt { width: 80mm; min-width: 80mm; max-width: 80mm; margin: 0 auto; }
            .center { text-align: center; }
            .logo-wrap { margin-bottom: 4px; }
            .logo-wrap img { max-width: 26mm; max-height: 16mm; object-fit: contain; display: block; margin: 0 auto; }
            h2 { margin: 0; font-size: 14px; }
            .muted { font-size: 10px; line-height: 1.25; }
            .line { border-top: 1px dashed #000; margin: 4px 0; }
            .meta { margin: 1px 0; font-size: 11px; line-height: 1.25; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            th, td { border-bottom: 1px dashed #999; padding: 4px 2px; vertical-align: top; font-size: 10px; }
            th { text-align: left; }
            .totals { margin-top: 6px; }
            .totals p { margin: 3px 0; display: flex; justify-content: space-between; font-size: 11px; }
            .strong { font-weight: 700; }
            .note { margin-top: 6px; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="center">
              ${company.logoUrl ? `<div class="logo-wrap"><img src="${escapeHtml(company.logoUrl)}" alt="Company logo" /></div>` : ''}
              <h2>${escapeHtml(company.name || 'Company')}</h2>
              ${company.address ? `<div class="muted">${escapeHtml(company.address)}</div>` : ''}
              ${company.phone ? `<div class="muted">Tel: ${escapeHtml(company.phone)}</div>` : ''}
              ${company.email ? `<div class="muted">${escapeHtml(company.email)}</div>` : ''}
              ${company.website ? `<div class="muted">${escapeHtml(company.website)}</div>` : ''}
            </div>

            <div class="line"></div>

            <p class="meta"><strong>Outlet:</strong> ${escapeHtml(outletDisplay)}</p>
            <p class="meta"><strong>Bill #:</strong> ${escapeHtml(sale.sale_number || '-')}</p>
            ${sale.do_number ? `<p class="meta"><strong>DO #:</strong> ${escapeHtml(sale.do_number)}</p>` : ''}
            <p class="meta"><strong>Date:</strong> ${escapeHtml(saleDate)}</p>
            <p class="meta"><strong>Customer:</strong> ${escapeHtml(customer)}</p>

            <div class="line"></div>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th style="text-align:right;">Qty</th>
                  <th style="text-align:right;">Issue</th>
                  <th style="text-align:right;">Discount</th>
                  <th style="text-align:right;">Price</th>
                  <th style="text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${lineRows || '<tr><td colspan="6">No line items</td></tr>'}
              </tbody>
            </table>

            <div class="line"></div>

            <div class="totals">
              <p><span>Total Qty</span><span>${Number(sale.total_quantity || 0).toFixed(2)}</span></p>
              <p><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></p>
              <p><span>Discount</span><span>${Number(sale.discount_amount || 0).toFixed(2)}</span></p>
              <p class="strong"><span>Grand Total</span><span>${Number(sale.total_amount || 0).toFixed(2)}</span></p>
              <p><span>Paid (${escapeHtml(String(sale.payment_type || 'cash').toUpperCase())})</span><span>${Number(sale.paid_amount || 0).toFixed(2)}</span></p>
              <p><span>Balance</span><span>${Number(sale.balance_amount || 0).toFixed(2)}</span></p>
            </div>

            <p class="note"><strong>Notes:</strong> ${escapeHtml((sale.notes || '').trim() || '-')}</p>
            <p class="center" style="margin-top:10px;">Thank you for your purchase</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const submitSale = async () => {
    if (!cashierSession?.is_open) {
      showNotice('Cashier is not open. Please open cash drawer first.');
      router.push(getPathWithCode('/outlet-pos/cash-drawer'));
      return;
    }

    if (cart.length === 0) {
      showNotice('Cart is empty.');
      return;
    }

    if (saleMode === 'order' && loads.length > 0 && selectedLoadId === 0) {
      showNotice('Please select a load record for this DO order.');
      return;
    }

    if (!Number.isFinite(Number(discountAmount || 0)) || Number(discountAmount || 0) < 0) {
      showNotice('Discount must be zero or greater.');
      return;
    }

    if (!Number.isFinite(Number(paidAmount || 0)) || Number(paidAmount || 0) < 0) {
      showNotice('Paid amount must be zero or greater.');
      return;
    }

    if (paymentType === 'bank' && selectedCompanyBankAccountId <= 0) {
      showNotice('Please select Company Main Account (Bank Account) for bank transfer payment.', 'Bank Transfer');
      return;
    }

    if (saleMode === 'exact_invoice' && balanceAmount > 0 && !selectedLoyaltyCustomerId) {
      showNotice('Credit sale is allowed only for loyalty customers. Please select a loyalty customer for this credit balance.', 'Credit Validation');
      return;
    }

    try {
      setSaving(true);

      const response = await axios.post(
        `${API_URL}/api/outlet-pos/sales`,
        {
          sale_mode: saleMode,
          ...(saleMode === 'get_order' ? { order_type: getOrderType } : {}),
          outlet_id: outletId,
          sale_date: saleDate || null,
          customer_name: customerName || null,
          loyalty_customer_id: saleMode === 'exact_invoice' ? (selectedLoyaltyCustomerId || null) : null,
          ...(saleMode === 'order' && selectedLoadId > 0 ? { load_id: selectedLoadId } : {}),
          discount_amount: effectiveDiscountAmount,
          paid_amount: effectivePaidAmount,
          payment_type: paymentType,
          ...(paymentType === 'bank' ? { company_bank_account_id: selectedCompanyBankAccountId } : {}),
          notes: notes || null,
          items: cart.map((line) => ({
            inventory_item_id: line.inventory_item_id,
            quantity: line.quantity,
            unit_price: line.base_unit_price,
            issue_type: line.issue_type,
            discount_amount: line.discount_amount,
          })),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const createdSale = response.data?.data as CreatedSale | undefined;

      setCart([]);
      setCustomerName('');
      setSaleDate(new Date().toISOString().slice(0, 16));
      setNotes('');
      setDiscountAmount('0.00');
      setPaidAmount('0.00');
      setPaymentType('cash');
      setSelectedLoadId(0);
      setGetOrderType('outlet_order');
      setSelectedLoyaltyCustomerId(0);
      setLoyaltySearch('');
      const awarded = Number(createdSale?.loyalty_points_awarded || 0);
      if (saleMode === 'exact_invoice') {
        setMessage(awarded > 0
          ? `Exact invoice created successfully. ${awarded.toFixed(2)} loyalty points awarded.`
          : 'Exact invoice created successfully. Bill is ready to print.');
      } else if (saleMode === 'get_order') {
        const orderTypeLabel = (createdSale?.order_type || getOrderType) === 'factory_order' ? 'Factory Order' : 'Outlet Order';
        setMessage(awarded > 0
          ? `Get Order (${orderTypeLabel}) created successfully. ${awarded.toFixed(2)} loyalty points awarded.`
          : `Get Order (${orderTypeLabel}) created successfully. Bill is ready to print.`);
      } else {
        setMessage(awarded > 0
          ? `Order created successfully. DO ${createdSale?.do_number || '-'} generated. ${awarded.toFixed(2)} loyalty points awarded.`
          : `Order created successfully. DO ${createdSale?.do_number || '-'} generated. Bill is ready to print.`);
      }
      if (createdSale) {
        setLastCreatedSale(createdSale);
        setTimeout(() => printCustomerBill(createdSale, saleMode), 120);
      }
      await refreshOutletData(token);
      setTimeout(() => {
        customerInputRef.current?.focus();
        customerInputRef.current?.select();
      }, 120);
    } catch (error: any) {
      console.error('Error recording sale:', error);
      const apiMessage = error?.response?.data?.message || 'Failed to record sale';
      const validationErrors = (error?.response?.data?.errors || {}) as Record<string, string[]>;
      const firstError = Object.values(validationErrors)?.[0]?.[0];
      showNotice(firstError || apiMessage, 'Validation');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`${isEmbedded ? 'py-10' : 'min-h-screen'} bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 flex items-center justify-center`}>
        <PageSkeleton />
      </div>
    );
  }

  const handleLogout = () => {
    if (cashierSession?.is_open) {
      showNotice('Cashier is still open. Please close cash drawer before logout.');
      router.push(getPathWithCode('/outlet-pos/cash-drawer'));
      return;
    }

    localStorage.removeItem('token');
    router.push('/');
  };

  return (
    <div className={`${isEmbedded ? '' : 'min-h-screen overflow-hidden'} bg-gradient-to-br from-red-50 via-pink-50 to-rose-50 relative`}>
      {!isEmbedded ? (
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute -bottom-8 left-40 w-72 h-72 bg-red-200 rounded-full mix-blend-multiply filter blur-xl"></div>
      </div>
      ) : null}

      {!isEmbedded ? (
      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">Outlet POS - Create Sale</h1>
                <p className="text-xs text-gray-600">{outletName} ({outletCode})</p>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href={getPathWithCode('/outlet-pos')}
                  className="px-3 py-1.5 text-sm rounded-md border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100"
                >
                  Dashboard
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/stock')}
                  className="px-3 py-1.5 text-sm rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                >
                  Stock
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/sales')}
                  className="px-3 py-1.5 text-sm rounded-md border border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100"
                >
                  Sales
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/cash-drawer')}
                  className="px-3 py-1.5 text-sm rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                >
                  Cash Drawer
                </Link>
                <Link
                  href={getPathWithCode('/outlet-pos/loyalty-customers')}
                  className="px-3 py-1.5 text-sm rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                >
                  Loyalty
                </Link>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md text-sm font-medium hover:from-rose-600 hover:to-pink-600"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      ) : null}

      <main className={`relative z-10 ${isEmbedded ? 'w-full p-5 sm:p-5 lg:p-5' : 'max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8'} space-y-6`}>
        {!cashierSession?.is_open && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-amber-800">Cashier Not Open</h2>
            <p className="text-sm text-amber-700 mt-1">You must open cash drawer before creating sales for the day.</p>
            <div className="mt-3">
              <Link
                href={getPathWithCode('/outlet-pos/cash-drawer')}
                className="inline-flex px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-md text-sm font-medium hover:from-emerald-700 hover:to-teal-700"
              >
                Open Cash Drawer
              </Link>
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Items in outlet', String(stockTotals.totalItems)],
            ['Available qty', stockTotals.totalAvailableQty.toFixed(2)],
            [`Sales today (${todayIsoDate})`, String(salesTotals.totalSales)],
            ['Sales amount today', salesTotals.totalAmount.toFixed(2)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="text-lg font-bold text-slate-900">{value}</div>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl lg:col-span-2">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Create Sale</h2>
              <p className="mt-0.5 text-sm text-slate-500">Choose the sale type, fill customer details, then add items.</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([
                  ['order', 'Create Order (DO)', 'Delivery order from outlet stock'],
                  ['get_order', 'Get Order', 'Order any item, not limited to outlet stock'],
                  ['exact_invoice', 'Exact Invoice', 'Invoice from outlet stock, loyalty supported'],
                ] as const).map(([value, title, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSaleMode(value)}
                    aria-pressed={saleMode === value}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      saleMode === value
                        ? 'border-rose-600 bg-rose-50 ring-2 ring-rose-200'
                        : 'border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/50'
                    }`}
                  >
                    <span className={`block text-sm font-semibold ${saleMode === value ? 'text-rose-700' : 'text-slate-800'}`}>{title}</span>
                    <span className="block text-xs text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">1</span>
              <h3 className="text-sm font-semibold text-slate-900">Customer details</h3>
            </div>
            <div className={`grid grid-cols-1 ${(saleMode === 'order' || saleMode === 'get_order') ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4 mb-4`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name or Phone</label>
                <input
                  ref={customerInputRef}
                  type="text"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setShowCustomerSuggestions(true);
                  }}
                  onKeyDown={handleCustomerInputKeyDown}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 120)}
                  className={formInputClass}
                  placeholder="Search distribution or loyalty customers"
                />
                {showCustomerSuggestions && (
                  <div className="relative">
                    <div className="absolute z-20 mt-2 w-full max-h-56 overflow-auto rounded-xl border border-rose-100 bg-white shadow-xl">
                      {filteredCustomerSuggestions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">No matching customers found.</div>
                      ) : (
                        filteredCustomerSuggestions.map((customer) => (
                          <button
                            key={`${customer.source}-${customer.id}`}
                            type="button"
                            onClick={() => selectCustomerSuggestion(customer)}
                            className="w-full text-left px-3 py-2 hover:bg-rose-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="text-sm text-gray-900 font-medium">{customer.code} - {customer.name}</div>
                            <div className="text-xs text-gray-600">
                              {customer.phone || '-'} | {customer.source === 'loyalty' ? 'Loyalty' : 'Distribution'}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={openCustomerRegisterModal}
                    className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Register Customer
                  </button>
                  {!customerName.trim() && (
                    <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-600">
                      Walk-in customer will be used automatically.
                    </span>
                  )}
                  {matchedLoyaltyByCustomerPhone && (
                    <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                      Phone matched loyalty: {matchedLoyaltyByCustomerPhone.customer_code} - {matchedLoyaltyByCustomerPhone.name}
                    </span>
                  )}
                  {canQuickCreateLoyaltyFromCustomerPhone && (
                    <button
                      type="button"
                      onClick={quickCreateLoyaltyFromCustomerPhone}
                      disabled={creatingLoyaltyFromCustomerPhone}
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {creatingLoyaltyFromCustomerPhone ? 'Adding loyalty...' : 'Add loyalty with this phone'}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date & Time</label>
                <input
                  type="datetime-local"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className={formInputClass}
                />
              </div>
              {saleMode === 'get_order' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Remark</label>
                  <select
                    value={getOrderType}
                    onChange={(e) => setGetOrderType(e.target.value as 'outlet_order' | 'factory_order')}
                    className={formInputClass}
                  >
                    <option value="outlet_order">Outlet Order</option>
                    <option value="factory_order">Factory Order</option>
                  </select>
                </div>
              )}
              {saleMode === 'order' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">DO Load</label>
                  <select
                    value={selectedLoadId}
                    onChange={(e) => setSelectedLoadId(Number(e.target.value || 0))}
                    className={formInputClass}
                  >
                    <option value={0}>{loads.length > 0 ? 'Select load record' : 'No load records found'}</option>
                    {loads.map((row) => (
                      <option key={row.id} value={row.id}>
                        {`${row.load_number} | Date: ${row.load_date ? String(row.load_date).split('T')[0] : '-'} | Route: ${row.route?.route_name || row.route?.name || row.route?.code || '-'} | Vehicle: ${row.vehicle?.vehicle_no || row.vehicle?.vehicle_number || row.vehicle?.registration_number || '-'} | ${String(row.status || 'pending').replace(/_/g, ' ')}`}
                      </option>
                    ))}
                  </select>
                  {selectedLoad && (
                    <div className="mt-2 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                      <div className="overflow-x-auto whitespace-nowrap">
                        Route: {selectedLoad.route?.route_name || selectedLoad.route?.name || selectedLoad.route?.code || '-'} |
                        Vehicle: {selectedLoad.vehicle?.vehicle_no || selectedLoad.vehicle?.vehicle_number || selectedLoad.vehicle?.registration_number || '-'} |
                        Driver: {selectedLoad.driver?.name || `${String(selectedLoad.driver?.first_name || '').trim()} ${String(selectedLoad.driver?.last_name || '').trim()}`.trim() || '-'} |
                        Load Date: {selectedLoad.load_date ? new Date(selectedLoad.load_date).toLocaleDateString() : '-'}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {saleMode === 'exact_invoice' && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Loyalty Customer (Optional Manual Search)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={loyaltySearch}
                    onChange={(e) => {
                      setLoyaltySearch(e.target.value);
                      setShowLoyaltySuggestions(true);
                      setSelectedLoyaltyCustomerId(0);
                    }}
                    onFocus={() => setShowLoyaltySuggestions(true)}
                    onBlur={() => setTimeout(() => setShowLoyaltySuggestions(false), 120)}
                    placeholder="Search loyalty by code, name or phone"
                    className={formInputClass}
                  />
                  {showLoyaltySuggestions && (
                    <div className="absolute z-20 mt-2 w-full max-h-56 overflow-auto rounded-xl border border-rose-100 bg-white shadow-xl">
                      {filteredLoyaltyCustomers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">No loyalty customers found.</div>
                      ) : (
                        filteredLoyaltyCustomers.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => selectLoyaltyCustomer(customer)}
                            className="w-full text-left px-3 py-2 hover:bg-amber-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="text-sm text-gray-900 font-medium">{customer.customer_code} - {customer.name}</div>
                            <div className="text-xs text-gray-600">{customer.phone} | Points: {Number(customer.points_balance || 0).toFixed(2)}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {selectedLoyaltyCustomer && (
                  <div className="mt-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span>
                      Selected: {selectedLoyaltyCustomer.customer_code} - {selectedLoyaltyCustomer.name} | Current Points: {Number(selectedLoyaltyCustomer.points_balance || 0).toFixed(2)}
                    </span>
                    <button type="button" onClick={clearLoyaltyCustomer} className="font-semibold hover:underline">Clear</button>
                  </div>
                )}
              </div>
              )}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={formInputClass}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="mb-3 mt-6 flex items-center gap-3 border-t border-slate-100 pt-5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">2</span>
              <h3 className="text-sm font-semibold text-slate-900">Add items</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-3">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                <div className="relative">
                  <input
                    ref={itemSearchInputRef}
                    type="text"
                    value={itemSearch}
                    onChange={(e) => {
                      setItemSearch(e.target.value);
                      setShowItemSuggestions(true);
                      setHighlightedSuggestionIndex(0);
                      setSelectedItemId(0);
                    }}
                    onFocus={() => setShowItemSuggestions(true)}
                    onBlur={() => {
                      setTimeout(() => setShowItemSuggestions(false), 120);
                    }}
                    onKeyDown={handleItemSearchKeyDown}
                    placeholder="Type code or item name"
                    className={formInputClassCompact}
                  />
                  <p className="mt-1 text-xs text-gray-500">Use Arrow Up/Down to choose item, Enter to select.</p>

                  {showItemSuggestions && (
                    <div className="absolute z-40 mt-2 w-full max-h-64 overflow-auto rounded-xl border border-rose-100 bg-white shadow-xl">
                      {filteredStocks.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">No matching items.</div>
                      ) : (
                        filteredStocks.map((line, index) => (
                          <button
                            ref={(el) => {
                              itemSuggestionRefs.current[index] = el;
                            }}
                            key={line.inventory_item_id}
                            type="button"
                            onClick={() => selectStockItem(line)}
                            className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 ${
                              filteredStocks[highlightedSuggestionIndex]?.inventory_item_id === line.inventory_item_id
                                ? 'bg-rose-100'
                                : 'hover:bg-rose-50'
                            }`}
                            title={`${line.code} - ${line.name}`}
                          >
                            <div className="text-sm text-gray-900 font-medium truncate">{line.code} - {line.name}</div>
                            <div className="text-xs text-gray-600">
                              {saleMode === 'get_order'
                                ? `Sell: ${Number(line.sell_price || 0).toFixed(2)}`
                                : `Outlet Avail: ${Number(line.available_qty).toFixed(2)} | Sell: ${Number(line.sell_price || 0).toFixed(2)}`}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issue Type</label>
                <select
                  value={selectedIssueType}
                  onChange={(e) => setSelectedIssueType(e.target.value as 'free' | 'sample' | 'retail' | 'wholesale' | 'van_sale')}
                  className={formInputClassCompact}
                >
                  {ISSUE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Qty</label>
                <input
                  ref={qtyInputRef}
                  type="number"
                  min="0"
                  step="0.01"
                  value={selectedQty}
                  onChange={(e) => setSelectedQty(e.target.value)}
                  onKeyDown={handleAddToCartKeyDown}
                  className={formInputClassCompact}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Line Discount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={selectedLineDiscount}
                  onChange={(e) => setSelectedLineDiscount(e.target.value)}
                  onKeyDown={handleAddToCartKeyDown}
                  className={formInputClassCompact}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={selectedPrice}
                  onChange={(e) => setSelectedPrice(e.target.value)}
                  onKeyDown={handleAddToCartKeyDown}
                  className={formInputClassCompact}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Effective Unit Price: {selectedEffectiveUnitPrice.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <button
                type="button"
                onClick={addToCart}
                className="px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-md text-sm font-medium hover:from-rose-600 hover:to-pink-600"
              >
                Add to Cart
              </button>
            </div>

          </section>

          <section id="stock-section" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white shadow-xl lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">3</span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Cart &amp; Payment</h2>
                  <p className="text-xs text-slate-500">{cart.length} {cart.length === 1 ? 'item' : 'items'} added</p>
                </div>
              </div>
              <Link
                href={getPathWithCode('/outlet-pos/stock')}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                View stock
              </Link>
            </div>

            <div className="max-h-72 overflow-y-auto px-5">
              {cart.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-xl">🛒</div>
                  <p className="mt-3 text-sm font-medium text-slate-700">Your cart is empty</p>
                  <p className="mt-1 text-xs text-slate-500">Choose an item in step 2 and press &quot;Add to Cart&quot;.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {cart.map((line) => (
                    <li key={line.row_id} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900" title={line.item_name}>{line.item_name}</p>
                        <p className="text-xs text-slate-500">{line.item_code} · {formatIssueTypeLabel(line.issue_type)}</p>
                        <p className="mt-1 text-xs text-slate-600">
                          {line.quantity.toFixed(2)} {line.unit} × {line.unit_price.toFixed(2)}
                          {line.discount_amount > 0 ? <span className="text-emerald-700"> · discount {line.discount_amount.toFixed(2)}</span> : null}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">{(line.quantity * line.unit_price).toFixed(2)}</p>
                        <button
                          type="button"
                          onClick={() => removeFromCart(line.row_id)}
                          className="mt-1 text-xs font-medium text-rose-600 hover:text-rose-800"
                          aria-label={`Remove ${line.item_name}`}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-4 border-t border-slate-100 px-5 py-4">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Payment method</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    ['cash', 'Cash'],
                    ['bank', 'Bank'],
                    ['card', 'Card'],
                    ['voucher', 'Voucher'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPaymentType(value)}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                        paymentType === value
                          ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentType === 'bank' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Company bank account</label>
                  <select
                    value={selectedCompanyBankAccountId}
                    onChange={(e) => setSelectedCompanyBankAccountId(Number(e.target.value || 0))}
                    className={formInputClassCompact}
                  >
                    <option value={0}>
                      {companyBankAccounts.length > 0 ? 'Select company bank account' : 'No company bank accounts available'}
                    </option>
                    {companyBankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {`${account.bank_name || 'Bank'}${account.branch ? ` - ${account.branch}` : ''}${account.account_no ? ` (A/C: ${account.account_no})` : ''}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Bill discount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className={formInputClassCompact}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-700">Amount paid</label>
                    <button
                      type="button"
                      onClick={() => setPaidAmount(payableTotal.toFixed(2))}
                      disabled={payableTotal <= 0}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-800 disabled:text-slate-300"
                    >
                      Pay full
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className={formInputClassCompact}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{cartTotal.toFixed(2)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>Total discount</dt><dd>- {totalDiscountAmount.toFixed(2)}</dd></div>
                <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                  <dt className="text-base font-semibold text-slate-900">Grand total</dt>
                  <dd className="text-2xl font-bold text-slate-900">{payableTotal.toFixed(2)}</dd>
                </div>
                <div className="flex justify-between text-slate-600"><dt>Paid ({paymentTypeLabel(paymentType)})</dt><dd>{effectivePaidAmount.toFixed(2)}</dd></div>
                <div className={`flex justify-between font-semibold ${balanceAmount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  <dt>{balanceAmount > 0 ? 'Balance due' : 'Fully paid'}</dt>
                  <dd>{balanceAmount.toFixed(2)}</dd>
                </div>
                {selectedLoyaltyCustomerId > 0 && (
                  <div className="flex justify-between text-xs font-medium text-amber-700"><dt>Loyalty points to award</dt><dd>{loyaltyPointsPreview.toFixed(2)}</dd></div>
                )}
              </dl>

              <button
                type="button"
                disabled={saving || cart.length === 0 || !cashierSession?.is_open}
                onClick={submitSale}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-200 transition hover:from-rose-700 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {saving
                  ? 'Saving...'
                  : saleMode === 'order'
                    ? 'Create Order & Generate DO'
                    : saleMode === 'get_order'
                      ? 'Create Get Order'
                      : 'Create Exact Invoice'}
              </button>
              {!cashierSession?.is_open ? (
                <p className="mt-2 text-center text-xs text-amber-700">Open the cash drawer to create sales.</p>
              ) : cart.length === 0 ? (
                <p className="mt-2 text-center text-xs text-slate-500">Add at least one item to continue.</p>
              ) : null}

              {lastCreatedSale && (
                <button
                  type="button"
                  onClick={() => printCustomerBill(lastCreatedSale, lastCreatedSale.do_number ? 'order' : 'exact_invoice')}
                  className="mt-2 w-full rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  Print last bill
                </button>
              )}
            </div>
          </section>
        </div>

      </main>

      {showCustomerRegisterModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 px-3 py-6 backdrop-blur-sm sm:px-4">
          <div className="relative mx-auto w-full max-w-3xl rounded-3xl border border-white/70 bg-white/92 p-5 shadow-[0_30px_90px_-35px_rgba(16,185,129,0.55)] backdrop-blur-xl sm:p-6">
            <div className="mb-5 flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">Create Customer Shop</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Capture complete shop details with route mapping and outstanding balance.
                </p>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                Customer Profile
              </span>
            </div>

            <form onSubmit={handleRegisterCustomer} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Shop Name</label>
                  <input
                    type="text"
                    value={customerFormData.shop_name}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, shop_name: e.target.value })}
                    className="w-full rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Customer Code</label>
                  <input
                    type="text"
                    value={customerFormData.customer_code}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, customer_code: e.target.value })}
                    className="w-full rounded-xl border border-blue-200 bg-gradient-to-b from-white to-blue-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Owner Name</label>
                  <input
                    type="text"
                    value={customerFormData.owner_name}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, owner_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Phone</label>
                  <input
                    type="text"
                    value={customerFormData.phone}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Route</label>
                  <select
                    value={customerFormData.route_id}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, route_id: e.target.value })}
                    className="w-full rounded-xl border border-cyan-200 bg-gradient-to-b from-white to-cyan-50/35 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                  >
                    <option value="">Select Route</option>
                    {distributionRoutes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.name} ({route.origin || '-'} {'->'} {route.destination || '-'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</label>
                  <select
                    value={customerFormData.status}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, status: e.target.value as 'active' | 'inactive' })}
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
                    value={customerFormData.outstanding}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, outstanding: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Address</label>
                <textarea
                  value={customerFormData.address}
                  onChange={(e) => setCustomerFormData({ ...customerFormData, address: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-4 focus:ring-slate-100"
                  rows={3}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomerRegisterModal(false);
                    resetCustomerForm();
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="rounded-xl border border-transparent bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingCustomer ? 'Saving...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {noticeModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">{noticeModal.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{noticeModal.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setNoticeModal({ isOpen: false, title: '', message: '' })}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OutletPosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-red-50 flex items-center justify-center">
          <PageSkeleton />
        </div>
      }
    >
      <OutletPosContent />
    </Suspense>
  );
}
