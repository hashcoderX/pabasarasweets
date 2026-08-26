'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

interface Customer { id: number; shop_name: string; customer_code: string; route_id?: number | null; }
interface Item { id: number; name: string; code: string; unit: string; sell_price: number; current_stock: number; }

interface LoadItemInfo {
  id: number;
  load_id: number;
  product_code: string;
  name: string;
  qty: number;
  sell_price: number;
}

interface LoadItemSuggestion {
  load_item_id: number;
  inventory_item_id: number | null;
  item_code: string;
  item_name: string;
  unit: string;
  load_qty: number;
  sell_price: number;
  warehouse_stock: number;
}

interface InvoiceItem {
  id: number;
  inventory_item_id: number | null;
  item_code: string;
  item_name: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discount?: number;
}

interface GpsSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  captured_at: string;
}

interface InvoiceRecord {
  id: number;
  invoice_number: string;
  customer_id: number;
  load_id?: number | null;
  customer?: { shop_name: string; customer_code?: string };
  invoice_date: string;
  due_date?: string | null;
  subtotal?: number;
  discount?: number;
  total: number;
  status: string;
  items: InvoiceItem[];
  notes?: string | null;
  ref_latitude?: number | null;
  ref_longitude?: number | null;
  ref_gps_accuracy?: number | null;
  ref_gps_captured_at?: string | null;
  billing_latitude?: number | null;
  billing_longitude?: number | null;
  billing_gps_accuracy?: number | null;
  billing_gps_captured_at?: string | null;
}

interface DeliveryOrderRecord {
  id: number;
  sale_number: string;
  do_number?: string | null;
  load_id?: number | null;
  sale_date: string;
  customer_name?: string | null;
  total_amount: number;
  status?: string | null;
  outlet?: {
    name?: string;
    code?: string;
  } | null;
}

interface InvoiceLine {
  line_id: string;
  inventory_item_id: number | null;
  item_code: string;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  base_unit_price?: number;
  item_discount?: number;
  free_quantity?: number;
  paid_quantity?: number;
  source_load_item_id?: number | null;
}

interface ReturnLine {
  inventory_item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  amount: number;
  is_damaged: boolean;
}

interface PendingOfflineInvoice {
  id: string;
  createdAt: string;
  payload: {
    load_id: number | null;
    invoice_number: string;
    customer_id: number;
    invoice_date: string;
    due_date: string | null;
    discount: number;
    notes: string;
    ref_latitude?: number | null;
    ref_longitude?: number | null;
    ref_gps_accuracy?: number | null;
    ref_gps_captured_at?: string | null;
    billing_latitude?: number | null;
    billing_longitude?: number | null;
    billing_gps_accuracy?: number | null;
    billing_gps_captured_at?: string | null;
    items: {
      inventory_item_id: number | null;
      item_code: string;
      item_name: string;
      unit: string | null;
      quantity: number;
      unit_price: number;
      discount?: number;
    }[];
    payment?: {
      amount: number;
      method: 'cash' | 'check' | 'bank_transfer' | 'bill_to_bill';
      date: string;
      cheque_date?: string | null;
      reference?: string | null;
      bank_name?: string | null;
      target_invoice_id?: number | null;
    } | null;
    returnPayload?: {
      return_number: string;
      customer_id: number;
      return_date: string;
      total_quantity: number;
      total_amount: number;
      settlement_type: 'bill_deduction' | 'cash_refund' | 'item_exchange';
      settlement_amount: number;
      exchange_inventory_item_id: number | null;
      exchange_quantity: number;
      reason?: string | null;
      status: string;
      notes?: string | null;
    } | null;
  };
}

interface LoadOption {
  id: number;
  load_number?: string;
  load_date?: string;
  status?: string;
}

const OFFLINE_INVOICE_STORAGE_KEY = 'distribution_offline_invoices';
const COMPANY_PROFILE_ID_KEY = 'company_profile_id';

const normalizeCompanyLogoUrl = (rawUrl?: string, rawPath?: string): string => {
  const logoPath = String(rawPath || '').trim();
  if (logoPath) {
    return `/storage/${logoPath.replace(/^\/+/, '')}`;
  }

  const url = String(rawUrl || '').trim();
  if (!url) return '';

  if (url.startsWith('/storage/')) {
    return url;
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname.startsWith('/storage/')) {
        return `${parsed.pathname}${parsed.search || ''}`;
      }
    } catch {
      return url;
    }
  }

  return url;
};

export default function DistributionInvoicesPage() {
  const [token, setToken] = useState('');
  const [companyProfileName, setCompanyProfileName] = useState('Company');
  const [companyProfileLogoUrl, setCompanyProfileLogoUrl] = useState('');
  const [companyProfileAddress, setCompanyProfileAddress] = useState('');
  const [companyProfilePhone, setCompanyProfilePhone] = useState('');
  const [companyProfileEmail, setCompanyProfileEmail] = useState('');
  const [companyProfileWebsite, setCompanyProfileWebsite] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [assignedRouteId, setAssignedRouteId] = useState('');
  const [assignedRouteIds, setAssignedRouteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrderRecord[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [discountValue, setDiscountValue] = useState('0');
  const [notes, setNotes] = useState('');

  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedLoadItemId, setSelectedLoadItemId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(-1);
  const [lineQty, setLineQty] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([]);

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnInvoice, setReturnInvoice] = useState<InvoiceRecord | null>(null);
  const [returnLineId, setReturnLineId] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [settlementType, setSettlementType] = useState<'bill_deduction' | 'cash_refund' | 'item_exchange'>('bill_deduction');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [exchangeItemId, setExchangeItemId] = useState('');
  const [exchangeQty, setExchangeQty] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSearch, setReturnSearch] = useState('');
  const [showReturnSuggestions, setShowReturnSuggestions] = useState(false);
  const [returnSelectedItemId, setReturnSelectedItemId] = useState('');
  const [returnQtyInput, setReturnQtyInput] = useState('');
  const [returnAmountInput, setReturnAmountInput] = useState('');
  const [returnDamageInput, setReturnDamageInput] = useState(false);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);

  const [lineFreeQty, setLineFreeQty] = useState('');
  const [lineItemDiscountType, setLineItemDiscountType] = useState<'percentage' | 'amount'>('percentage');
  const [lineItemDiscount, setLineItemDiscount] = useState('');

  const [addPayment, setAddPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'check' | 'bank_transfer' | 'bill_to_bill'>('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [lastBillAmount, setLastBillAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentChequeDate, setPaymentChequeDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentBankName, setPaymentBankName] = useState('');
  const [refGpsSnapshot, setRefGpsSnapshot] = useState<GpsSnapshot | null>(null);
  const [billingGpsSnapshot, setBillingGpsSnapshot] = useState<GpsSnapshot | null>(null);
  const [capturingGpsTarget, setCapturingGpsTarget] = useState<'ref' | 'billing' | null>(null);

  const [activeLoadId, setActiveLoadId] = useState('');
  const [availableLoads, setAvailableLoads] = useState<LoadOption[]>([]);
  const [selectedLoadFilter, setSelectedLoadFilter] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceDateFilter, setInvoiceDateFilter] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerPickerSearch, setCustomerPickerSearch] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(-1);
  const [loadItems, setLoadItems] = useState<LoadItemInfo[]>([]);
  const [inlineReturnMode, setInlineReturnMode] = useState<'deduct' | 'exchange'>('deduct');

  const [qtyWarningOpen, setQtyWarningOpen] = useState(false);
  const [qtyWarningMessage, setQtyWarningMessage] = useState('');
  const [deleteConfirmInvoice, setDeleteConfirmInvoice] = useState<InvoiceRecord | null>(null);

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingReturnId, setEditingReturnId] = useState<number | null>(null);

  const [posPrintInvoice, setPosPrintInvoice] = useState<InvoiceRecord | null>(null);
  const posPrintRef = useRef<HTMLDivElement | null>(null);
  const customerPickerRef = useRef<HTMLDivElement | null>(null);

  const [pendingOfflineInvoices, setPendingOfflineInvoices] = useState<PendingOfflineInvoice[]>([]);
  const [syncingOfflineInvoices, setSyncingOfflineInvoices] = useState(false);

  const [viewInvoice, setViewInvoice] = useState<InvoiceRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [editingInvoiceId, setEditingInvoiceId] = useState<number | null>(null);

  const router = useRouter();
  const createLineId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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
      console.error('Failed to load company profile for print header:', error);
    }
  }, []);

  useEffect(() => {
    if (!token || typeof window === 'undefined') return;

    const hydrateCompanyHeader = async () => {
      try {
        const applyCompanyHeader = (company: {
          name?: string;
          logo_url?: string;
          logo_path?: string;
          address?: string;
          phone?: string;
          email?: string;
          website?: string;
        }) => {
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

          const currentRaw = window.localStorage.getItem('company_profile_data');
          const current = currentRaw ? JSON.parse(currentRaw) : {};
          const merged = {
            ...current,
            ...company,
            logo_url: latestLogoUrl,
          };
          window.localStorage.setItem('company_profile_data', JSON.stringify(merged));
        };

        const profileId = Number(window.localStorage.getItem(COMPANY_PROFILE_ID_KEY) || 0);
        if (profileId > 0) {
          const byIdRes = await axios.get(`/api/companies/${profileId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          const companyById = (byIdRes?.data || {}) as {
            name?: string;
            logo_url?: string;
            logo_path?: string;
            address?: string;
            phone?: string;
            email?: string;
            website?: string;
          };

          applyCompanyHeader(companyById);
          return;
        }

        // Fallback to first company from companies table when no local profile id exists.
        const listRes = await axios.get('/api/companies', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1 },
        });

        const rows = Array.isArray(listRes?.data)
          ? listRes.data
          : (listRes?.data?.data || []);
        const firstCompany = (Array.isArray(rows) ? rows[0] : null) as
          | {
              name?: string;
              logo_url?: string;
              logo_path?: string;
              address?: string;
              phone?: string;
              email?: string;
              website?: string;
            }
          | null;

        if (firstCompany) {
          applyCompanyHeader(firstCompany);
        }
      } catch (error) {
        console.error('Failed to refresh company profile for print header:', error);
      }
    };

    hydrateCompanyHeader();
  }, [token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(OFFLINE_INVOICE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PendingOfflineInvoice[];
        if (Array.isArray(parsed)) {
          setPendingOfflineInvoices(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load offline invoices from storage:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        OFFLINE_INVOICE_STORAGE_KEY,
        JSON.stringify(pendingOfflineInvoices)
      );
    } catch (error) {
      console.error('Failed to persist offline invoices to storage:', error);
    }
  }, [pendingOfflineInvoices]);

  const resolveAssignedRoute = async () => {
    const searchParams = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;

    const routeFromQuery = searchParams?.get('route_id');
    const loadFromQuery = searchParams?.get('load_id');

    if (routeFromQuery) {
      setAssignedRouteId(routeFromQuery);
      setAssignedRouteIds([routeFromQuery]);
      localStorage.setItem('distribution_assigned_route_id', routeFromQuery);
    }

    if (loadFromQuery) {
      setActiveLoadId(loadFromQuery);
      localStorage.setItem('distribution_active_load_id', loadFromQuery);
    }

    const cachedRouteId = localStorage.getItem('distribution_assigned_route_id');
    const cachedLoadId = localStorage.getItem('distribution_active_load_id');
    if (cachedRouteId) {
      setAssignedRouteId(cachedRouteId);
      setAssignedRouteIds([cachedRouteId]);
    }
    if (cachedLoadId) {
      setActiveLoadId(cachedLoadId);
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

      const loadsRes = await axios.get('/api/vehicle-loading/loads', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const loads = Array.isArray(loadsRes.data) ? loadsRes.data : (loadsRes.data?.data || []);
      const mappedLoads: LoadOption[] = loads.map((load: any) => ({
        id: Number(load.id),
        load_number: String(load.load_number || ''),
        load_date: String(load.load_date || ''),
        status: String(load.status || ''),
      }));
      setAvailableLoads(mappedLoads);

      if (adminUser) {
        const cachedAdminLoadFilter = localStorage.getItem('distribution_admin_invoice_load_filter') || '';
        const adminLoad = loadFromQuery || cachedAdminLoadFilter;
        setAssignedRouteId('');
        setAssignedRouteIds([]);
        setActiveLoadId('');
        if (adminLoad) {
          setSelectedLoadFilter(adminLoad);
        }
        return;
      }

      if (loadFromQuery) {
        const matchedLoad = loads.find((load: any) => String(load?.id || '') === String(loadFromQuery));
        const routeIds = matchedLoad ? getRouteIdsFromLoad(matchedLoad) : [];

        setActiveLoadId(String(loadFromQuery));
        localStorage.setItem('distribution_active_load_id', String(loadFromQuery));

        if (routeIds.length > 0) {
          setAssignedRouteId(routeIds[0]);
          setAssignedRouteIds(routeIds);
          localStorage.setItem('distribution_assigned_route_id', routeIds[0]);
        } else if (routeFromQuery) {
          setAssignedRouteId(routeFromQuery);
          setAssignedRouteIds([routeFromQuery]);
          localStorage.setItem('distribution_assigned_route_id', routeFromQuery);
        } else {
          setAssignedRouteId('');
          setAssignedRouteIds([]);
          localStorage.removeItem('distribution_assigned_route_id');
        }
        return;
      }

      if (routeFromQuery) {
        setAssignedRouteId(routeFromQuery);
        setAssignedRouteIds([routeFromQuery]);
        localStorage.setItem('distribution_assigned_route_id', routeFromQuery);
        return;
      }

      if (!employeeId) return;

      const assignedLoad = loads
        .filter((load: any) => Number(load.sales_ref_id) === employeeId && ['pending', 'in_transit'].includes(load.status))
        .sort((a: any, b: any) => new Date(b.load_date || b.created_at || 0).getTime() - new Date(a.load_date || a.created_at || 0).getTime())[0];

      if (assignedLoad?.id) {
        const loadId = String(assignedLoad.id);
        setActiveLoadId(loadId);
        localStorage.setItem('distribution_active_load_id', loadId);
      } else if (!loadFromQuery) {
        setActiveLoadId('');
        localStorage.removeItem('distribution_active_load_id');
      }

      const assignedRouteIdsFromLoad = assignedLoad ? getRouteIdsFromLoad(assignedLoad) : [];

      if (assignedRouteIdsFromLoad.length > 0) {
        setAssignedRouteId(assignedRouteIdsFromLoad[0]);
        setAssignedRouteIds(assignedRouteIdsFromLoad);
        localStorage.setItem('distribution_assigned_route_id', assignedRouteIdsFromLoad[0]);
      } else if (!routeFromQuery) {
        setAssignedRouteId('');
        setAssignedRouteIds([]);
        localStorage.removeItem('distribution_assigned_route_id');
      }
    } catch (error) {
      console.error('Error resolving assigned route on invoices page:', error);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    localStorage.setItem('distribution_admin_invoice_load_filter', selectedLoadFilter || '');
  }, [isAdmin, selectedLoadFilter]);

  const formatLoadDate = (value?: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const generateInvoiceNumber = () => `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
  const generatePaymentNumber = () => `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;
  const generateReturnNumber = () => `RET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 900 + 100)}`;

  const formatGpsSnapshot = (snapshot: GpsSnapshot | null) => {
    if (!snapshot) return 'Not captured';
    const accuracy = snapshot.accuracy === null ? 'n/a' : `${snapshot.accuracy.toFixed(1)}m`;
    const capturedAt = new Date(snapshot.captured_at).toLocaleString();
    return `${snapshot.latitude.toFixed(6)}, ${snapshot.longitude.toFixed(6)} (Acc: ${accuracy}) • ${capturedAt}`;
  };

  const captureGpsSnapshot = (target: 'ref' | 'billing') => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setQtyWarningMessage('GPS is not available on this device/browser.');
      setQtyWarningOpen(true);
      return;
    }

    setCapturingGpsTarget(target);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const snapshot: GpsSnapshot = {
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          accuracy: Number.isFinite(position.coords.accuracy) ? Number(position.coords.accuracy) : null,
          captured_at: new Date().toISOString(),
        };

        if (target === 'ref') {
          setRefGpsSnapshot(snapshot);
        } else {
          setBillingGpsSnapshot(snapshot);
        }

        setCapturingGpsTarget(null);
      },
      (error) => {
        const errorMessage =
          error.code === 1
            ? 'GPS permission denied. Please allow location access.'
            : error.code === 2
              ? 'Unable to detect GPS position. Move to an open area and try again.'
              : 'GPS request timed out. Please try again.';
        setCapturingGpsTarget(null);
        setQtyWarningMessage(errorMessage);
        setQtyWarningOpen(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const getInvoiceDueBalance = (invoice: any): number => {
    const explicitDue = Number(invoice?.due_amount ?? invoice?.balance_amount ?? 0);
    if (explicitDue > 0) return explicitDue;

    const total = Number(invoice?.total ?? 0);
    const paid = Number(invoice?.paid_amount ?? 0);
    const derived = total - paid;
    return derived > 0 ? derived : 0;
  };

  const getLastUnpaidInvoiceForCustomer = (targetCustomerId: number, excludeInvoiceId?: number | null) => {
    const candidates = invoices
      .filter((inv) => Number(inv.customer_id) === targetCustomerId)
      .filter((inv) => !excludeInvoiceId || Number(inv.id) !== Number(excludeInvoiceId))
      .filter((inv) => !['cancelled', 'paid'].includes(String(inv.status || '').toLowerCase()))
      .filter((inv) => getInvoiceDueBalance(inv) > 0)
      .sort((a, b) => {
        const aTime = new Date(a.invoice_date || 0).getTime();
        const bTime = new Date(b.invoice_date || 0).getTime();
        return bTime - aTime;
      });

    return candidates[0] || null;
  };

  const syncOfflineInvoices = async () => {
    if (!token || syncingOfflineInvoices || pendingOfflineInvoices.length === 0) return;
    setSyncingOfflineInvoices(true);
    try {
      const stillPending: PendingOfflineInvoice[] = [];
      let anySynced = false;

      for (const entry of pendingOfflineInvoices) {
        const inv = entry.payload;
        try {
          const invoiceRes = await axios.post('/api/distribution/invoices', {
            load_id: inv.load_id ?? (activeLoadId ? Number(activeLoadId) : (isAdmin && selectedLoadFilter ? Number(selectedLoadFilter) : null)),
            invoice_number: inv.invoice_number,
            customer_id: inv.customer_id,
            invoice_date: inv.invoice_date,
            due_date: inv.due_date,
            discount: inv.discount,
            notes: inv.notes,
            ref_latitude: inv.ref_latitude ?? null,
            ref_longitude: inv.ref_longitude ?? null,
            ref_gps_accuracy: inv.ref_gps_accuracy ?? null,
            ref_gps_captured_at: inv.ref_gps_captured_at ?? null,
            billing_latitude: inv.billing_latitude ?? null,
            billing_longitude: inv.billing_longitude ?? null,
            billing_gps_accuracy: inv.billing_gps_accuracy ?? null,
            billing_gps_captured_at: inv.billing_gps_captured_at ?? null,
            items: inv.items,
          }, { headers: { Authorization: `Bearer ${token}` } });

          const createdInvoice: any = invoiceRes.data?.data;

          if (inv.payment && createdInvoice?.id) {
            try {
              const targetInvoiceId = inv.payment.method === 'bill_to_bill'
                ? Number(inv.payment.target_invoice_id || 0)
                : Number(createdInvoice.id);

              if (inv.payment.method === 'bill_to_bill' && !targetInvoiceId) {
                throw new Error('Missing target invoice for bill-to-bill sync.');
              }

              await axios.post('/api/distribution/payments', {
                payment_number: generatePaymentNumber(),
                distribution_invoice_id: targetInvoiceId,
                load_id: createdInvoice.load_id ?? inv.load_id ?? (activeLoadId ? Number(activeLoadId) : (isAdmin && selectedLoadFilter ? Number(selectedLoadFilter) : null)),
                customer_id: createdInvoice.customer_id ?? inv.customer_id,
                payment_date: inv.payment.date,
                cheque_date: inv.payment.method === 'check' ? (inv.payment.cheque_date || null) : null,
                amount: inv.payment.amount,
                payment_method: inv.payment.method === 'bill_to_bill' ? 'cash' : inv.payment.method,
                reference_no: inv.payment.reference || null,
                bank_name: inv.payment.bank_name || null,
                status: 'received',
                notes: inv.payment.method === 'bill_to_bill'
                  ? `Bill to bill settlement from invoice ${createdInvoice.invoice_number} (offline sync)`
                  : `Auto payment from invoice ${createdInvoice.invoice_number} (offline sync)`,
              }, { headers: { Authorization: `Bearer ${token}` } });
            } catch (paymentError) {
              console.error('Failed to sync offline payment for invoice:', paymentError);
            }
          }

          if (entry.payload.returnPayload && createdInvoice?.id) {
            try {
              const rp = entry.payload.returnPayload;
              await axios.post('/api/distribution/returns', {
                return_number: rp.return_number,
                distribution_invoice_id: createdInvoice.id,
                customer_id: createdInvoice.customer_id ?? inv.customer_id,
                returned_inventory_item_id: null,
                return_date: rp.return_date,
                total_quantity: rp.total_quantity,
                total_amount: rp.total_amount,
                settlement_type: rp.settlement_type,
                settlement_amount: rp.settlement_amount,
                exchange_inventory_item_id: rp.exchange_inventory_item_id,
                exchange_quantity: rp.exchange_quantity,
                reason: rp.reason,
                status: rp.status,
                notes: rp.notes,
              }, { headers: { Authorization: `Bearer ${token}` } });
            } catch (returnError) {
              console.error('Failed to sync offline return for invoice:', returnError);
            }
          }

          anySynced = true;
        } catch (error: any) {
          console.error('Failed to sync offline invoice entry, keeping in queue:', error);
          stillPending.push(entry);
        }
      }

      if (anySynced) {
        setPendingOfflineInvoices(stillPending);
        fetchData();
      }
    } finally {
      setSyncingOfflineInvoices(false);
    }
  };

  const fetchLoadItems = async (loadId: string) => {
    if (!loadId) return;
    try {
      const response = await axios.get('/api/vehicle-loading/load-items', {
        headers: { Authorization: `Bearer ${token}` },
        params: { load_id: loadId },
      });
      const raw = Array.isArray(response.data) ? response.data : (response.data?.data || []);
      const mapped: LoadItemInfo[] = raw.map((li: any) => ({
        id: Number(li.id),
        load_id: Number(li.load_id),
        product_code: String(li.product_code),
        name: String(li.name ?? ''),
        qty: Number(li.qty) || 0,
        sell_price: Number(li.sell_price) || 0,
      }));
      setLoadItems(mapped);
    } catch (error) {
      console.error('Error fetching active load items for invoices:', error);
      setLoadItems([]);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [customersRes, inventoryRes, invoicesRes] = await Promise.all([
        axios.get('/api/distribution/customers', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
        axios.get('/api/stock/inventory', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
        axios.get('/api/distribution/invoices', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 50 } }),
      ]);

      setCustomers(customersRes.data?.data?.data || []);
      const inventory = inventoryRes.data?.data?.data || inventoryRes.data?.data || [];
      setItems(inventory.filter((item: any) => item.status === 'active').map((item: any) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        unit: item.unit,
        sell_price: Number(item.sell_price) || 0,
        current_stock: Number(item.current_stock) || 0,
      })));
      setInvoices(invoicesRes.data?.data?.data || []);

      try {
        const doRes = await axios.get('/api/outlet-pos/sales', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 200, do_only: 1 },
        });

        const rows = doRes.data?.data?.data || [];
        const mapped: DeliveryOrderRecord[] = rows.map((row: any) => ({
          id: Number(row.id),
          sale_number: String(row.sale_number || ''),
          do_number: row.do_number || null,
          load_id: row.load_id ? Number(row.load_id) : null,
          sale_date: String(row.sale_date || ''),
          customer_name: row.customer_name || null,
          total_amount: Number(row.total_amount || 0),
          status: row.status || null,
          outlet: row.outlet || null,
        }));

        setDeliveryOrders(mapped.filter((row) => !!row.do_number));
      } catch (error: any) {
        const status = error?.response?.status;
        if (status !== 401 && status !== 403) {
          console.error('Error loading delivery orders for invoices page:', error);
        }
        setDeliveryOrders([]);
      }

      setInvoiceNumber(generateInvoiceNumber());
    } catch (error) {
      console.error('Error loading invoices page data:', error);
      setCustomers([]);
      setItems([]);
      setInvoices([]);
      setDeliveryOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && activeLoadId) {
      fetchLoadItems(activeLoadId);
    } else {
      setLoadItems([]);
    }
  }, [token, activeLoadId]);

  useEffect(() => {
    if (!token) return;

    const handleOnline = () => {
      syncOfflineInvoices();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    // Try an initial sync when token becomes available
    syncOfflineInvoices();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [token, pendingOfflineInvoices.length]);

  const addLine = () => {
    const selectedInventory = items.find((item) => item.id === Number(selectedItemId));
    const selectedLoadEntry = selectedLoadItemId
      ? loadItems.find((li) => String(li.id) === String(selectedLoadItemId))
      : null;
    const selectedCode = selectedLoadEntry?.product_code || selectedInventory?.code || '';
    const inventoryByCode = selectedCode
      ? items.find((item) => item.code === selectedCode) || null
      : null;
    const selected = selectedLoadEntry
      ? {
          id: inventoryByCode?.id || selectedInventory?.id || 0,
          name: selectedLoadEntry.name || inventoryByCode?.name || selectedCode,
          code: selectedCode,
          unit: inventoryByCode?.unit || 'qty',
          sell_price: selectedLoadEntry.sell_price > 0
            ? selectedLoadEntry.sell_price
            : (inventoryByCode?.sell_price || selectedInventory?.sell_price || 0),
          current_stock: Number(selectedLoadEntry.qty) || Number(inventoryByCode?.current_stock || 0),
        }
      : selectedInventory;
    const paidQty = Number(lineQty);
    const freeQty = Number(lineFreeQty) || 0;
    if (!selected) {
      setQtyWarningMessage('Please select an item from the list.');
      setQtyWarningOpen(true);
      return;
    }
    if (!paidQty || paidQty <= 0) {
      setQtyWarningMessage('Please enter a valid quantity.');
      setQtyWarningOpen(true);
      return;
    }

    const totalUnits = paidQty + freeQty;
    if (totalUnits <= 0) {
      setQtyWarningMessage('Total quantity must be greater than zero.');
      setQtyWarningOpen(true);
      return;
    }

    const activeLoadNumeric = Number(activeLoadId) || undefined;
    const matchingLoad = selectedLoadEntry || loadItems.find(
      (li) =>
        li.product_code === selected.code &&
        (!activeLoadNumeric || li.load_id === activeLoadNumeric)
    );

    if (matchingLoad) {
      const alreadyOnInvoice = lines
        .filter((line) => line.source_load_item_id === matchingLoad.id)
        .reduce((sum, line) => sum + line.quantity, 0);

      const remainingFromLoad = Number(matchingLoad.qty) - alreadyOnInvoice;

      if (remainingFromLoad <= 0) {
        setQtyWarningMessage(
          `No remaining quantity for this item in the current load. Loaded: ${Number(matchingLoad.qty).toFixed(2)} ${selected.unit}.`
        );
        setQtyWarningOpen(true);
        return;
      }

      if (totalUnits > remainingFromLoad + 1e-9) {
        setQtyWarningMessage(
          `You can only add up to ${remainingFromLoad.toFixed(2)} ${selected.unit} from this load (loaded: ${Number(
            matchingLoad.qty
          ).toFixed(2)}).`
        );
        setQtyWarningOpen(true);
        return;
      }
    }
    const basePrice = matchingLoad && matchingLoad.sell_price > 0
      ? matchingLoad.sell_price
      : selected.sell_price;
    const rawDiscount = Math.max(0, Number(lineItemDiscount) || 0);
    const discountPerUnit = basePrice > 0
      ? lineItemDiscountType === 'percentage'
        ? Math.round(((Math.min(100, rawDiscount) * basePrice) / 100) * 100) / 100
        : Math.min(basePrice, rawDiscount)
      : 0;
    const effectivePaidUnitPrice = Math.max(0, basePrice - discountPerUnit);

    setLines((prev) => {
      const existingIndex = prev.findIndex(
        (line) =>
          line.inventory_item_id === selected.id &&
          (line.source_load_item_id || null) === (matchingLoad?.id || null) &&
          (line.item_discount || 0) === discountPerUnit &&
          (line.base_unit_price || line.unit_price) === basePrice
      );

      if (existingIndex >= 0) {
        const copy = [...prev];
        const existing = copy[existingIndex];
        const existingFree = existing.free_quantity || 0;
        const existingPaid =
          typeof existing.paid_quantity === 'number'
            ? existing.paid_quantity
            : existing.quantity - existingFree;
        copy[existingIndex] = {
          ...existing,
          quantity: existing.quantity + totalUnits,
          free_quantity: existingFree + freeQty,
          paid_quantity: existingPaid + paidQty,
        };
        return copy;
      }

      return [
        ...prev,
        {
          line_id: createLineId(),
          inventory_item_id: selected.id > 0 ? selected.id : null,
          item_code: selected.code,
          item_name: selected.name,
          unit: selected.unit,
          quantity: totalUnits,
          unit_price: effectivePaidUnitPrice,
          base_unit_price: basePrice,
          item_discount: discountPerUnit,
          free_quantity: freeQty,
          paid_quantity: paidQty,
          source_load_item_id: matchingLoad?.id || null,
        },
      ];
    });

    setSelectedItemId('');
    setSelectedLoadItemId('');
    setItemSearch('');
    setShowItemDropdown(false);
    setHighlightedItemIndex(-1);
    setLineQty('');
    setLineFreeQty('');
    setLineItemDiscount('');
  };

  const removeLine = (lineId: string) => setLines((prev) => prev.filter((line) => line.line_id !== lineId));

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const freeQty = line.free_quantity || 0;
        const paidQty =
          typeof line.paid_quantity === 'number'
            ? line.paid_quantity
            : line.quantity - freeQty;
        return sum + paidQty * line.unit_price;
      }, 0),
    [lines]
  );

  const updateLineQuantities = (lineId: string, newPaid: number, newFree: number) => {
    setLines((prev) => {
      const line = prev.find((l) => l.line_id === lineId);
      if (!line) return prev;

      const paidQty = newPaid;
      const freeQty = newFree;
      const totalUnits = paidQty + freeQty;

      if (totalUnits <= 0) {
        setQtyWarningMessage('Total quantity must be greater than zero.');
        setQtyWarningOpen(true);
        return prev;
      }

      const activeLoadNumeric = Number(activeLoadId) || undefined;
      const matchingLoad = line.source_load_item_id
        ? loadItems.find((li) => li.id === line.source_load_item_id)
        : loadItems.find(
            (li) =>
              li.product_code === line.item_code &&
              (!activeLoadNumeric || li.load_id === activeLoadNumeric)
          );

      if (matchingLoad) {
        const otherLinesTotal = prev
          .filter((l) => l.source_load_item_id === matchingLoad.id && l.line_id !== line.line_id)
          .reduce((sum, l) => sum + l.quantity, 0);

        const remainingFromLoad = Number(matchingLoad.qty) - otherLinesTotal;

        if (remainingFromLoad <= 0) {
          setQtyWarningMessage(
            `No remaining quantity for this item in the current load. Loaded: ${Number(
              matchingLoad.qty
            ).toFixed(2)} ${line.unit}.`
          );
          setQtyWarningOpen(true);
          return prev;
        }

        if (totalUnits > remainingFromLoad + 1e-9) {
          setQtyWarningMessage(
            `You can only set up to ${remainingFromLoad.toFixed(2)} ${line.unit} from this load (loaded: ${Number(
              matchingLoad.qty
            ).toFixed(2)}).`
          );
          setQtyWarningOpen(true);
          return prev;
        }
      }

      return prev.map((l) => {
        if (l.line_id !== lineId) return l;
        return {
          ...l,
          quantity: paidQty + freeQty,
          paid_quantity: paidQty,
          free_quantity: freeQty,
        };
      });
    });
  };

  const getLineBasePrice = (line: InvoiceLine) =>
    typeof line.base_unit_price === 'number'
      ? line.base_unit_price
      : line.unit_price + (line.item_discount || 0);

  const getLineDiscountPercent = (line: InvoiceLine) => {
    const base = getLineBasePrice(line);
    const disc = line.item_discount || 0;
    if (base <= 0) return 0;
    return Math.round((disc / base) * 10000) / 100;
  };

  const updateLineDiscountPercent = (lineId: string, percent: number) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.line_id !== lineId) return line;
        const base = getLineBasePrice(line);
        const clampedPercent = Math.min(100, Math.max(0, percent));
        const newDiscount =
          base > 0 ? Math.round(((base * clampedPercent) / 100) * 100) / 100 : 0;
        const effectivePaidUnitPrice = Math.max(0, base - newDiscount);
        return {
          ...line,
          base_unit_price: base,
          item_discount: newDiscount,
          unit_price: effectivePaidUnitPrice,
        };
      })
    );
  };

  const updateLineUnitPrice = (lineId: string, newPrice: number) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.line_id !== lineId) return line;
        const price = Math.max(0, newPrice);
        const base =
          typeof line.base_unit_price === 'number'
            ? line.base_unit_price
            : price + (line.item_discount || 0);
        const discount = Math.max(0, base - price);
        return {
          ...line,
          base_unit_price: base,
          unit_price: price,
          item_discount: discount,
        };
      })
    );
  };

  const updateReturnLine = (
    itemId: number,
    updates: Partial<Pick<ReturnLine, 'quantity' | 'unit_price' | 'amount' | 'is_damaged'>>
  ) => {
    setReturnLines((prev) =>
      prev.map((line) => {
        if (line.inventory_item_id !== itemId) return line;

        const qty = updates.quantity !== undefined ? Math.max(0, Number(updates.quantity) || 0) : line.quantity;
        const price = updates.unit_price !== undefined ? Math.max(0, Number(updates.unit_price) || 0) : line.unit_price;
        const amount = updates.amount !== undefined ? Math.max(0, Number(updates.amount) || 0) : line.amount;
        const isDamaged = updates.is_damaged !== undefined ? Boolean(updates.is_damaged) : line.is_damaged;

        return {
          ...line,
          quantity: qty,
          unit_price: price,
          amount,
          is_damaged: isDamaged,
        };
      })
    );
  };
  const scopedCustomers = useMemo(() => {
    if (assignedRouteIds.length === 0) return customers;
    const routeIdSet = new Set(assignedRouteIds);
    const matched = customers.filter((customer) => routeIdSet.has(String(customer.route_id || '')));
    // If there is no active load and cached route is stale, avoid blocking shop selection.
    if (matched.length === 0 && !activeLoadId) {
      return customers;
    }
    return matched;
  }, [customers, assignedRouteIds, activeLoadId]);

  const selectedCustomer = useMemo(
    () => scopedCustomers.find((customer) => customer.id === Number(customerId)) || null,
    [scopedCustomers, customerId]
  );

  const customerSuggestions = useMemo(() => {
    const term = customerPickerSearch.trim().toLowerCase();
    const source = scopedCustomers;

    const filtered = !term
      ? source
      : source.filter((customer) => {
          const shopName = String(customer.shop_name || '').toLowerCase();
          const code = String(customer.customer_code || '').toLowerCase();
          return shopName.includes(term) || code.includes(term);
        });

    return filtered.slice(0, 12);
  }, [scopedCustomers, customerPickerSearch]);

  const scopedCustomerIdSet = useMemo(() => new Set(scopedCustomers.map((customer) => customer.id)), [scopedCustomers]);
  const customerNameById = useMemo(() => {
    const map = new Map<number, string>();
    customers.forEach((customer) => {
      map.set(customer.id, String(customer.shop_name || ''));
    });
    return map;
  }, [customers]);

  const scopedInvoices = useMemo(() => {
    if (assignedRouteIds.length === 0) return invoices;
    return invoices.filter((invoice) => scopedCustomerIdSet.has(invoice.customer_id));
  }, [invoices, scopedCustomerIdSet, assignedRouteIds]);

  const effectiveLoadFilter = useMemo(
    () => (isAdmin ? selectedLoadFilter : activeLoadId),
    [isAdmin, selectedLoadFilter, activeLoadId]
  );

  const filteredInvoices = useMemo(() => {
    const searchTerm = invoiceSearch.trim().toLowerCase();
    const customerTerm = customerSearch.trim().toLowerCase();

    return scopedInvoices.filter((invoice) => {
      if (isAdmin && selectedLoadFilter && String(invoice.load_id || '') !== selectedLoadFilter) {
        return false;
      }

      if (invoiceDateFilter) {
        const invoiceDateValue = String(invoice.invoice_date || '').slice(0, 10);
        if (invoiceDateValue !== invoiceDateFilter) return false;
      }

      if (searchTerm) {
        const invoiceNumber = String(invoice.invoice_number || '').toLowerCase();
        const invoiceIdText = String(invoice.id || '').toLowerCase();
        if (!invoiceNumber.includes(searchTerm) && !invoiceIdText.includes(searchTerm)) {
          return false;
        }
      }

      if (customerTerm) {
        const customerName = String(
          invoice.customer?.shop_name || customerNameById.get(invoice.customer_id) || ''
        ).toLowerCase();
        if (!customerName.includes(customerTerm)) {
          return false;
        }
      }

      return true;
    });
  }, [
    scopedInvoices,
    isAdmin,
    selectedLoadFilter,
    invoiceDateFilter,
    invoiceSearch,
    customerSearch,
    customerNameById,
  ]);

  const filteredDeliveryOrders = useMemo(() => {
    const searchTerm = invoiceSearch.trim().toLowerCase();
    const customerTerm = customerSearch.trim().toLowerCase();

    return deliveryOrders.filter((record) => {
      if (effectiveLoadFilter && String(record.load_id || '') !== effectiveLoadFilter) {
        return false;
      }

      if (invoiceDateFilter) {
        const saleDateValue = String(record.sale_date || '').slice(0, 10);
        if (saleDateValue !== invoiceDateFilter) return false;
      }

      if (searchTerm) {
        const doNumber = String(record.do_number || '').toLowerCase();
        const saleNumber = String(record.sale_number || '').toLowerCase();
        const saleIdText = String(record.id || '').toLowerCase();
        if (!doNumber.includes(searchTerm) && !saleNumber.includes(searchTerm) && !saleIdText.includes(searchTerm)) {
          return false;
        }
      }

      if (customerTerm) {
        const customerName = String(record.customer_name || '').toLowerCase();
        if (!customerName.includes(customerTerm)) {
          return false;
        }
      }

      return true;
    });
  }, [deliveryOrders, effectiveLoadFilter, invoiceDateFilter, invoiceSearch, customerSearch]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredInvoices.length / pageSize)),
    [filteredInvoices.length, pageSize]
  );

  const pagedInvoices = useMemo(
    () => {
      const start = (currentPage - 1) * pageSize;
      return filteredInvoices.slice(start, start + pageSize);
    },
    [filteredInvoices, currentPage, pageSize]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredInvoices.length]);

  const filteredItems = useMemo(() => {
    const search = itemSearch.trim().toLowerCase();
    if (!search) return [] as LoadItemSuggestion[];

    const inventoryByCode = new Map(items.map((item) => [item.code, item] as const));

    return loadItems
      .filter((loadItem) => !activeLoadId || String(loadItem.load_id) === String(activeLoadId))
      .map((loadItem) => {
        const matchedInventory = inventoryByCode.get(loadItem.product_code);

        return {
          load_item_id: loadItem.id,
          inventory_item_id: matchedInventory?.id || null,
          item_code: loadItem.product_code,
          item_name: loadItem.name || matchedInventory?.name || loadItem.product_code,
          unit: matchedInventory?.unit || 'qty',
          load_qty: Number(loadItem.qty) || 0,
          sell_price: loadItem.sell_price > 0 ? loadItem.sell_price : Number(matchedInventory?.sell_price || 0),
          warehouse_stock: Number(matchedInventory?.current_stock || 0),
        } as LoadItemSuggestion;
      })
      .filter((item) =>
        item.item_code.toLowerCase().includes(search) || item.item_name.toLowerCase().includes(search)
      )
      .slice(0, 8);
  }, [itemSearch, loadItems, items, activeLoadId]);
  const selectedItem = useMemo(() => {
    if (selectedLoadItemId) {
      const selectedLoadRow = loadItems.find((li) => String(li.id) === String(selectedLoadItemId));
      if (selectedLoadRow) {
        const matchedInventory = items.find((item) => item.code === selectedLoadRow.product_code);
        return {
          id: matchedInventory?.id || 0,
          name: selectedLoadRow.name || matchedInventory?.name || selectedLoadRow.product_code,
          code: selectedLoadRow.product_code,
          unit: matchedInventory?.unit || 'qty',
          sell_price: selectedLoadRow.sell_price > 0 ? selectedLoadRow.sell_price : Number(matchedInventory?.sell_price || 0),
          current_stock: Number(selectedLoadRow.qty) || Number(matchedInventory?.current_stock || 0),
        } as Item;
      }
    }

    return items.find((item) => item.id === Number(selectedItemId)) || null;
  }, [selectedLoadItemId, selectedItemId, loadItems, items]);
  const discountAmount = useMemo(() => {
    const value = Number(discountValue) || 0;
    if (discountType === 'percentage') {
      return Math.max(0, (subtotal * value) / 100);
    }
    return Math.max(0, value);
  }, [discountType, discountValue, subtotal]);
  const totalReturnValue = useMemo(
    () => returnLines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    [returnLines]
  );

  const payloadDiscount = useMemo(
    () => discountAmount + (inlineReturnMode === 'deduct' ? totalReturnValue : 0),
    [discountAmount, inlineReturnMode, totalReturnValue]
  );

  const invoiceTotalBeforeReturns = useMemo(
    () => Math.max(0, subtotal - discountAmount),
    [subtotal, discountAmount]
  );

  const invoiceFinalTotal = useMemo(
    () => Math.max(0, subtotal - payloadDiscount),
    [subtotal, payloadDiscount]
  );

  const returnSuggestionItems = useMemo(() => {
    const term = returnSearch.trim().toLowerCase();
    if (!term) return [] as Item[];
    return items
      .filter((item) =>
        item.code.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [returnSearch, items]);
  const resetInvoiceForm = () => {
    setInvoiceNumber(generateInvoiceNumber());
    setCustomerId('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setDueDate('');
    setDiscountType('amount');
    setDiscountValue('0');
    setNotes('');
    setCustomerPickerSearch('');
    setShowCustomerPicker(false);
    setHighlightedCustomerIndex(-1);
    setSelectedItemId('');
    setSelectedLoadItemId('');
    setItemSearch('');
    setShowItemDropdown(false);
    setHighlightedItemIndex(-1);
    setLineQty('');
    setLineFreeQty('');
    setLineItemDiscountType('percentage');
    setLineItemDiscount('');
    setLines([]);
    setReturnSearch('');
    setShowReturnSuggestions(false);
    setReturnSelectedItemId('');
    setReturnQtyInput('');
    setReturnAmountInput('');
    setReturnDamageInput(false);
    setReturnLines([]);
    setInlineReturnMode('deduct');
    setAddPayment(false);
    setPaymentMethod('cash');
    setPaymentAmount('');
    setLastBillAmount('');
    setPaymentDate(new Date().toISOString().split( 'T')[0]);
    setPaymentChequeDate(new Date().toISOString().split('T')[0]);
    setPaymentReference('');
    setPaymentBankName('');
    setRefGpsSnapshot(null);
    setBillingGpsSnapshot(null);
    setCapturingGpsTarget(null);
  };

  const refreshCompanyHeaderForPrint = async () => {
    if (!token || typeof window === 'undefined') return;

    try {
      const applyCompanyHeader = (company: {
        name?: string;
        logo_url?: string;
        logo_path?: string;
        address?: string;
        phone?: string;
        email?: string;
        website?: string;
      }) => {
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

        const currentRaw = window.localStorage.getItem('company_profile_data');
        const current = currentRaw ? JSON.parse(currentRaw) : {};
        const merged = {
          ...current,
          ...company,
          logo_url: latestLogoUrl,
        };
        window.localStorage.setItem('company_profile_data', JSON.stringify(merged));
      };

      const profileId = Number(window.localStorage.getItem(COMPANY_PROFILE_ID_KEY) || 0);
      if (profileId > 0) {
        const byIdRes = await axios.get(`/api/companies/${profileId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const companyById = (byIdRes?.data || {}) as {
          name?: string;
          logo_url?: string;
          logo_path?: string;
          address?: string;
          phone?: string;
          email?: string;
          website?: string;
        };

        applyCompanyHeader(companyById);
        return;
      }

      const listRes = await axios.get('/api/companies', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 50 },
      });

      const rows = Array.isArray(listRes?.data)
        ? listRes.data
        : (listRes?.data?.data || []);

      const companies = Array.isArray(rows) ? rows : [];
      const companyWithLogo = companies.find((company: any) => {
        const logoPath = String(company?.logo_path || '').trim();
        const logoUrl = String(company?.logo_url || '').trim();
        return Boolean(logoPath || logoUrl);
      });

      const firstCompany = (companyWithLogo || companies[0] || null) as
        | {
            name?: string;
            logo_url?: string;
            logo_path?: string;
            address?: string;
            phone?: string;
            email?: string;
            website?: string;
          }
        | null;

      if (firstCompany) {
        applyCompanyHeader(firstCompany);
      }
    } catch (error) {
      console.error('Failed to refresh company profile for print header:', error);
    }
  };

  const handlePosPrint = async (invoice: InvoiceRecord) => {
    await refreshCompanyHeaderForPrint();
    setPosPrintInvoice(invoice);

    // Allow React to render the print area before triggering print
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        const logoImage = posPrintRef.current?.querySelector<HTMLImageElement>('img[alt="Company logo"]') || null;
        if (!logoImage || !companyProfileLogoUrl) {
          window.print();
          return;
        }

        if (logoImage.complete && logoImage.naturalWidth > 0) {
          window.print();
          return;
        }

        let printed = false;
        const printNow = () => {
          if (printed) return;
          printed = true;
          window.print();
        };

        logoImage.addEventListener('load', printNow, { once: true });
        logoImage.addEventListener('error', printNow, { once: true });
        setTimeout(printNow, 1500);
      }
    }, 220);
  };

  const openViewInvoice = (invoice: InvoiceRecord) => {
    setViewInvoice(invoice);
  };

  const startEditInvoice = (invoice: InvoiceRecord) => {
    setEditingInvoiceId(invoice.id);

    setInvoiceNumber(invoice.invoice_number);
    setCustomerId(String(invoice.customer_id));
    setSelectedLoadItemId('');
    const editShopName = String(invoice.customer?.shop_name || '').trim();
    const editShopCode = String(invoice.customer?.customer_code || '').trim();
    if (editShopName) {
      setCustomerPickerSearch(editShopCode ? `${editShopName} (${editShopCode})` : editShopName);
    } else {
      setCustomerPickerSearch('');
    }
    setShowCustomerPicker(false);
    setHighlightedCustomerIndex(-1);

    const rawInvoiceDate = invoice.invoice_date || '';
    setInvoiceDate(rawInvoiceDate.length >= 10 ? rawInvoiceDate.substring(0, 10) : rawInvoiceDate);

    const rawDueDate = (invoice as any).due_date || '';
    setDueDate(rawDueDate && rawDueDate.length >= 10 ? rawDueDate.substring(0, 10) : '');

    setNotes(invoice.notes || '');

    const existingDiscount = typeof invoice.discount === 'number' ? invoice.discount : 0;
    setDiscountType('amount');
    setDiscountValue(existingDiscount.toString());

    setReturnSearch('');
    setShowReturnSuggestions(false);
    setReturnSelectedItemId('');
    setReturnQtyInput('');
    setReturnAmountInput('');
    setReturnDamageInput(false);
    setReturnLines([]);
    setInlineReturnMode('deduct');

    setAddPayment(false);
    setPaymentMethod('cash');
    setPaymentAmount('');
    setLastBillAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentChequeDate(new Date().toISOString().split('T')[0]);
    setPaymentReference('');
    setPaymentBankName('');

    const refLat = Number((invoice as any).ref_latitude);
    const refLng = Number((invoice as any).ref_longitude);
    setRefGpsSnapshot(
      Number.isFinite(refLat) && Number.isFinite(refLng)
        ? {
            latitude: refLat,
            longitude: refLng,
            accuracy: Number.isFinite(Number((invoice as any).ref_gps_accuracy))
              ? Number((invoice as any).ref_gps_accuracy)
              : null,
            captured_at: (invoice as any).ref_gps_captured_at || new Date().toISOString(),
          }
        : null
    );

    const billingLat = Number((invoice as any).billing_latitude);
    const billingLng = Number((invoice as any).billing_longitude);
    setBillingGpsSnapshot(
      Number.isFinite(billingLat) && Number.isFinite(billingLng)
        ? {
            latitude: billingLat,
            longitude: billingLng,
            accuracy: Number.isFinite(Number((invoice as any).billing_gps_accuracy))
              ? Number((invoice as any).billing_gps_accuracy)
              : null,
            captured_at: (invoice as any).billing_gps_captured_at || new Date().toISOString(),
          }
        : null
    );
    setCapturingGpsTarget(null);

    const mappedLines: InvoiceLine[] = (invoice.items || []).map((it, index) => {
      const qty = Number(it.quantity) || 0;
      const unitPrice = Number(it.unit_price) || 0;
      const itemDiscount = Number(it.discount) || 0;
      return {
        line_id: `${invoice.id}-${index}`,
        inventory_item_id: it.inventory_item_id ?? 0,
        item_code: it.item_code,
        item_name: it.item_name,
        unit: it.unit || '',
        quantity: qty,
        unit_price: unitPrice,
        base_unit_price: unitPrice + itemDiscount,
        item_discount: itemDiscount,
        free_quantity: 0,
        paid_quantity: qty,
        source_load_item_id: null,
      };
    });

    setLines(mappedLines);

    setShowModal(true);
  };

  const handleDeleteInvoice = async (invoice: InvoiceRecord) => {
    if (!token) {
      setQtyWarningMessage('Missing authentication token. Please log in again.');
      setQtyWarningOpen(true);
      return;
    }

    setDeleteConfirmInvoice(invoice);
  };

  const confirmDeleteInvoice = async () => {
    if (!deleteConfirmInvoice) return;

    try {
      await axios.delete(`/api/distribution/invoices/${deleteConfirmInvoice.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setDeleteConfirmInvoice(null);
      await fetchData();
    } catch (error: any) {
      setQtyWarningMessage(error?.response?.data?.message || 'Failed to delete invoice');
      setQtyWarningOpen(true);
    }
  };

  const openCreate = () => {
    setEditingInvoiceId(null);
    resetInvoiceForm();
    if (assignedRouteIds.length > 0 && scopedCustomers.length === 1) {
      setCustomerId(String(scopedCustomers[0].id));
      const onlyCustomer = scopedCustomers[0];
      setCustomerPickerSearch(`${onlyCustomer.shop_name} (${onlyCustomer.customer_code})`);
    }
    setShowModal(true);
  };

  useEffect(() => {
    if (!showModal || !addPayment || paymentMethod !== 'bill_to_bill') return;

    const selectedCustomerId = Number(customerId || 0);
    if (!selectedCustomerId) {
      setLastBillAmount('');
      return;
    }

    const lastInvoice = getLastUnpaidInvoiceForCustomer(selectedCustomerId, editingInvoiceId);
    if (!lastInvoice) {
      setLastBillAmount('');
      return;
    }

    const due = getInvoiceDueBalance(lastInvoice);
    if (due > 0) {
      setLastBillAmount(due.toFixed(2));
    }
  }, [showModal, addPayment, paymentMethod, customerId, invoices, editingInvoiceId]);

  useEffect(() => {
    if (!showModal) return;
    if (!customerId) return;
    if (customerPickerSearch.trim()) return;

    const selected = scopedCustomers.find((customer) => customer.id === Number(customerId));
    if (selected) {
      setCustomerPickerSearch(`${selected.shop_name} (${selected.customer_code})`);
    }
  }, [showModal, customerId, customerPickerSearch, scopedCustomers]);

  useEffect(() => {
    if (!showModal || !showCustomerPicker) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (!customerPickerRef.current) return;
      const target = event.target as Node;
      if (!customerPickerRef.current.contains(target)) {
        setShowCustomerPicker(false);
        setHighlightedCustomerIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [showModal, showCustomerPicker]);

  useEffect(() => {
    const modalActive = showModal || showReturnModal;
    if (!modalActive) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.overscrollBehaviorY = 'none';
    body.style.overscrollBehaviorY = 'none';

    const preventPullToRefresh = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      const target = event.target as HTMLElement | null;
      const insideAllowedScroll = target?.closest('.invoice-modal-scroll, .invoice-return-modal-scroll');
      if (insideAllowedScroll) return;

      event.preventDefault();
    };

    document.addEventListener('touchmove', preventPullToRefresh, { passive: false });

    return () => {
      html.style.overscrollBehaviorY = prevHtmlOverscroll;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
      document.removeEventListener('touchmove', preventPullToRefresh);
    };
  }, [showModal, showReturnModal]);

  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditing = editingInvoiceId !== null;
    const selectedLoadId = activeLoadId || (isAdmin ? selectedLoadFilter : '');
    const effectiveLoadId = selectedLoadId ? Number(selectedLoadId) : null;
    const billToBillAmount = Number(lastBillAmount || 0);
    const hasBillToBillSettlement = addPayment && paymentMethod === 'bill_to_bill' && billToBillAmount > 0;
    if (!customerId || lines.length === 0) {
      setQtyWarningMessage('Select customer and add at least one item line.');
      setQtyWarningOpen(true);
      return;
    }

    if (assignedRouteIds.length > 0 && !scopedCustomers.some((customer) => customer.id === Number(customerId))) {
      setQtyWarningMessage('Selected customer is not in your allocated route.');
      setQtyWarningOpen(true);
      return;
    }

    if (addPayment && paymentMethod !== 'bill_to_bill') {
      const amt = Number(paymentAmount);
      if (!amt || amt <= 0) {
        setQtyWarningMessage('Enter a valid payment amount.');
        setQtyWarningOpen(true);
        return;
      }

      if (paymentMethod === 'check' && !paymentChequeDate) {
        setQtyWarningMessage('Select cheque date for cheque payments.');
        setQtyWarningOpen(true);
        return;
      }
    }

    if (hasBillToBillSettlement) {
      if (isEditing) {
        setQtyWarningMessage('Bill To Bill option is available for new invoices only.');
        setQtyWarningOpen(true);
        return;
      }

      const lastInvoice = getLastUnpaidInvoiceForCustomer(Number(customerId), editingInvoiceId);
      if (!lastInvoice) {
        setQtyWarningMessage('No previous unpaid bill found for this customer.');
        setQtyWarningOpen(true);
        return;
      }

      const due = getInvoiceDueBalance(lastInvoice);
      if (due <= 0) {
        setQtyWarningMessage('Last bill has no due balance to settle.');
        setQtyWarningOpen(true);
        return;
      }

      if (billToBillAmount > due + 1e-9) {
        setQtyWarningMessage(`Last bill due is ${due.toFixed(2)}. Enter an amount up to due balance.`);
        setQtyWarningOpen(true);
        return;
      }
    }

    const composedNotes = (() => {
        const parts: string[] = [];
        if (notes.trim()) parts.push(notes.trim());

        if (lines.length > 0) {
          parts.push('[INVOICE LINES]');
          parts.push('Line breakdown:');
          lines.forEach((line) => {
            const freeQty = line.free_quantity || 0;
            const paidQty =
              typeof line.paid_quantity === 'number'
                ? line.paid_quantity
                : line.quantity - freeQty;
            const base =
              typeof line.base_unit_price === 'number'
                ? line.base_unit_price
                : line.unit_price + (line.item_discount || 0);
            const discountPercent = getLineDiscountPercent(line);
            const paidTotal = paidQty * line.unit_price;
            parts.push(
              `- ${paidQty.toFixed(2)} paid + ${freeQty.toFixed(2)} free x ${line.item_name} (${line.item_code}) @ base ${base.toFixed(2)}, disc ${discountPercent.toFixed(2)}%, effective ${line.unit_price.toFixed(2)} => paid total ${paidTotal.toFixed(2)}`
            );
          });
        }

        if (returnLines.length > 0) {
          parts.push('[ITEM RETURNS]');
          parts.push('Returned items:');
          returnLines.forEach((line) => {
            const lineValue = Number(line.amount || 0);
            parts.push(
              `- ${line.quantity.toFixed(2)} x ${line.item_name} (${line.item_code}) @ ${line.unit_price.toFixed(2)} => amount ${lineValue.toFixed(2)}${line.is_damaged ? ' [DAMAGED]' : ''}`
            );
          });
          parts.push(`Total return value: ${totalReturnValue.toFixed(2)}`);
          parts.push(
            inlineReturnMode === 'deduct'
              ? 'Return mode: DEDUCT FROM INVOICE'
              : 'Return mode: EXCHANGE ONLY (no deduction from invoice)'
          );
        }

        if (addPayment) {
          parts.push('[PAYMENT EVIDENCE]');

          if (paymentMethod === 'bill_to_bill') {
            const settlementAmount = Number(lastBillAmount || 0);
            const previousInvoice = settlementAmount > 0
              ? getLastUnpaidInvoiceForCustomer(Number(customerId), editingInvoiceId)
              : null;

            if (settlementAmount > 0) {
              parts.push('Payment mode: BILL TO BILL');
              parts.push(`Last bill amount paid: ${settlementAmount.toFixed(2)}`);
              if (previousInvoice?.invoice_number) {
                parts.push(`Settled invoice: ${previousInvoice.invoice_number}`);
              }
              parts.push(`Payment date: ${paymentDate || invoiceDate}`);
              if (paymentReference.trim()) {
                parts.push(`Reference: ${paymentReference.trim()}`);
              }
            } else {
              parts.push('Payment mode: CREDIT');
              parts.push('No settlement amount entered. This invoice remains credit.');
            }
          } else {
            const normalAmount = Number(paymentAmount || 0);
            if (normalAmount > 0) {
              parts.push(`Payment mode: ${String(paymentMethod || '').toUpperCase()}`);
              parts.push(`Amount paid: ${normalAmount.toFixed(2)}`);
              parts.push(`Payment date: ${paymentDate || invoiceDate}`);
              if (paymentMethod === 'check' && paymentChequeDate) {
                parts.push(`Cheque date: ${paymentChequeDate}`);
              }
              if (paymentBankName.trim()) {
                parts.push(`Bank: ${paymentBankName.trim()}`);
              }
              if (paymentReference.trim()) {
                parts.push(`Reference: ${paymentReference.trim()}`);
              }
            }
          }
        }

      return parts.join('\n');
    })();

    const itemsPayload = lines.flatMap((line) => {
        const freeQty = line.free_quantity || 0;
        const paidQty =
          typeof line.paid_quantity === 'number'
            ? line.paid_quantity
            : line.quantity - freeQty;

        const baseItem = {
          inventory_item_id: line.inventory_item_id,
          item_code: line.item_code,
          item_name: line.item_name,
          unit: line.unit,
        };

        const result: any[] = [];

        if (paidQty > 0) {
          result.push({
            ...baseItem,
            quantity: paidQty,
            unit_price: line.unit_price,
            discount: line.item_discount || 0,
          });
        }

        if (freeQty > 0) {
          result.push({
            ...baseItem,
            quantity: freeQty,
            unit_price: 0,
            discount: 0,
          });
        }
      return result;
    });

    const baseInvoicePayload = {
      load_id: effectiveLoadId,
      invoice_number: invoiceNumber,
      customer_id: Number(customerId),
      invoice_date: invoiceDate,
      due_date: dueDate || null,
      discount: payloadDiscount,
      notes: composedNotes,
      ref_latitude: refGpsSnapshot?.latitude ?? null,
      ref_longitude: refGpsSnapshot?.longitude ?? null,
      ref_gps_accuracy: refGpsSnapshot?.accuracy ?? null,
      ref_gps_captured_at: refGpsSnapshot?.captured_at ?? null,
      billing_latitude: billingGpsSnapshot?.latitude ?? null,
      billing_longitude: billingGpsSnapshot?.longitude ?? null,
      billing_gps_accuracy: billingGpsSnapshot?.accuracy ?? null,
      billing_gps_captured_at: billingGpsSnapshot?.captured_at ?? null,
      items: itemsPayload,
    };

    const targetLastInvoice = hasBillToBillSettlement
      ? getLastUnpaidInvoiceForCustomer(Number(customerId), editingInvoiceId)
      : null;

    const paymentPayload = (() => {
      if (!addPayment) return null;

      if (paymentMethod === 'bill_to_bill') {
        if (!hasBillToBillSettlement) return null;
        return {
          amount: billToBillAmount,
          method: paymentMethod,
          date: paymentDate || invoiceDate,
          cheque_date: null,
          reference: paymentReference || null,
          bank_name: paymentBankName || null,
          target_invoice_id: Number(targetLastInvoice?.id || 0),
        };
      }

      return {
        amount: Number(paymentAmount),
        method: paymentMethod,
        date: paymentDate || invoiceDate,
        cheque_date: paymentMethod === 'check' ? (paymentChequeDate || null) : null,
        reference: paymentReference || null,
        bank_name: paymentBankName || null,
        target_invoice_id: null,
      };
    })();

    const queueOfflineAndFinish = () => {
      const hasReturns = returnLines.length > 0;
      const hasDamagedReturns = returnLines.some((line) => line.is_damaged);
      const totalReturnQty = hasReturns
        ? returnLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
        : 0;

      const returnPayload = hasReturns
        ? {
            return_number: generateReturnNumber(),
            customer_id: Number(customerId),
            return_date: invoiceDate,
            total_quantity: totalReturnQty,
            total_amount: totalReturnValue,
            settlement_type: inlineReturnMode === 'deduct' ? 'bill_deduction' : 'item_exchange',
            settlement_amount: inlineReturnMode === 'deduct' ? totalReturnValue : 0,
            exchange_inventory_item_id: null,
            exchange_quantity: 0,
            reason: inlineReturnMode === 'deduct' && hasDamagedReturns ? 'damaged_items' : null,
            status: 'approved',
            notes: composedNotes,
          }
        : null;

      const offlineEntry = {
        id: `${invoiceNumber}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        payload: {
          ...baseInvoicePayload,
          payment: paymentPayload,
          returnPayload,
        },
      } as PendingOfflineInvoice;

      setPendingOfflineInvoices((prev) => [...prev, offlineEntry]);

      const customer = customers.find((c) => c.id === Number(customerId));
      const subtotalLocal = subtotal;
      const discountLocal = payloadDiscount;
      const totalLocal = Math.max(0, subtotalLocal - discountLocal);

      const pseudoInvoice: InvoiceRecord = {
        id: Date.now(),
        invoice_number: invoiceNumber,
        customer_id: Number(customerId),
        customer: customer
          ? { shop_name: customer.shop_name, customer_code: customer.customer_code }
          : undefined,
        invoice_date: invoiceDate,
        subtotal: subtotalLocal,
        discount: discountLocal,
        total: totalLocal,
        status: 'pending',
        items: baseInvoicePayload.items.map((it, index) => ({
          id: index,
          inventory_item_id: it.inventory_item_id,
          item_code: it.item_code,
          item_name: it.item_name,
          unit: it.unit,
          quantity: it.quantity,
          unit_price: it.unit_price,
          discount: Number(it.discount || 0),
        })),
        notes: composedNotes,
      };

      setShowModal(false);
      resetInvoiceForm();

      handlePosPrint(pseudoInvoice);

      setQtyWarningMessage('No internet connection. Invoice saved locally and will sync automatically when connection is available.');
      setQtyWarningOpen(true);
    };

    if (!isEditing && typeof navigator !== 'undefined' && !navigator.onLine) {
      queueOfflineAndFinish();
      return;
    }

    try {
      setSaving(true);

      let savedInvoice: any = null;

      if (isEditing) {
        const updateRes = await axios.put(
          `/api/distribution/invoices/${editingInvoiceId}`,
          {
            customer_id: Number(customerId),
            invoice_date: invoiceDate,
            due_date: dueDate || null,
            discount: payloadDiscount,
            status: undefined,
            notes: composedNotes,
            ref_latitude: refGpsSnapshot?.latitude ?? null,
            ref_longitude: refGpsSnapshot?.longitude ?? null,
            ref_gps_accuracy: refGpsSnapshot?.accuracy ?? null,
            ref_gps_captured_at: refGpsSnapshot?.captured_at ?? null,
            billing_latitude: billingGpsSnapshot?.latitude ?? null,
            billing_longitude: billingGpsSnapshot?.longitude ?? null,
            billing_gps_accuracy: billingGpsSnapshot?.accuracy ?? null,
            billing_gps_captured_at: billingGpsSnapshot?.captured_at ?? null,
            items: itemsPayload,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        savedInvoice = updateRes.data?.data;
      } else {
        const invoiceRes = await axios.post('/api/distribution/invoices', {
          ...baseInvoicePayload,
        }, { headers: { Authorization: `Bearer ${token}` } });
        savedInvoice = invoiceRes.data?.data;
      }

      if (paymentPayload && savedInvoice?.id) {
        try {
          const targetInvoiceId = paymentPayload.method === 'bill_to_bill'
            ? Number(paymentPayload.target_invoice_id || 0)
            : Number(savedInvoice.id);

          if (paymentPayload.method === 'bill_to_bill' && !targetInvoiceId) {
            throw new Error('Missing previous invoice for bill to bill settlement.');
          }

          await axios.post('/api/distribution/payments', {
            payment_number: generatePaymentNumber(),
            distribution_invoice_id: targetInvoiceId,
            load_id: savedInvoice.load_id ?? effectiveLoadId,
            customer_id: savedInvoice.customer_id ?? Number(customerId),
            payment_date: paymentPayload.date,
            cheque_date: paymentPayload.method === 'check' ? (paymentPayload.cheque_date || null) : null,
            amount: paymentPayload.amount,
            payment_method: paymentPayload.method === 'bill_to_bill' ? 'cash' : paymentPayload.method,
            reference_no: paymentPayload.reference || null,
            bank_name: paymentPayload.bank_name || null,
            status: 'received',
            notes: paymentPayload.method === 'bill_to_bill'
              ? `Bill to bill settlement from invoice ${savedInvoice.invoice_number}`
              : `Auto payment from invoice ${savedInvoice.invoice_number}`,
          }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (paymentError: any) {
          console.error('Failed to record payment for invoice:', paymentError);
          setQtyWarningMessage(paymentError?.response?.data?.message || 'Invoice saved, but payment could not be recorded.');
          setQtyWarningOpen(true);
        }
      }

      if (returnLines.length > 0 && savedInvoice?.id) {
        try {
          const hasDamagedReturns = returnLines.some((line) => line.is_damaged);
          const totalReturnQty = returnLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
          await axios.post('/api/distribution/returns', {
            return_number: generateReturnNumber(),
            distribution_invoice_id: savedInvoice.id,
            customer_id: savedInvoice.customer_id ?? Number(customerId),
            returned_inventory_item_id: null,
            return_date: invoiceDate,
            total_quantity: totalReturnQty,
            total_amount: totalReturnValue,
            settlement_type: inlineReturnMode === 'deduct' ? 'bill_deduction' : 'item_exchange',
            settlement_amount: inlineReturnMode === 'deduct' ? totalReturnValue : 0,
            exchange_inventory_item_id: null,
            exchange_quantity: 0,
            reason: inlineReturnMode === 'deduct' && hasDamagedReturns ? 'damaged_items' : null,
            status: 'approved',
            notes: composedNotes,
          }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (returnError: any) {
          console.error('Failed to record inline return for invoice:', returnError);
        }
      }

      setShowModal(false);
      setEditingInvoiceId(null);
      resetInvoiceForm();

      await fetchData();

      if (!isEditing && savedInvoice) {
        handlePosPrint(savedInvoice as InvoiceRecord);
      }
    } catch (error: any) {
      if (!isEditing && !error?.response) {
        // Network / connectivity issue on create -> queue for offline sync
        queueOfflineAndFinish();
      } else {
        setQtyWarningMessage(error?.response?.data?.message || (isEditing ? 'Failed to update invoice' : 'Failed to create invoice'));
        setQtyWarningOpen(true);
      }
    } finally {
      setSaving(false);
    }
  };
  const handleReturnSuggestionClick = (item: Item) => {
    setReturnSelectedItemId(String(item.id));
    setReturnSearch(`${item.code} - ${item.name}`);
    const qty = Number(returnQtyInput || 0);
    if (qty > 0) {
      setReturnAmountInput((qty * Number(item.sell_price || 0)).toFixed(2));
    }
    setShowReturnSuggestions(false);
  };

  const addReturnLine = () => {
    const selected = items.find((item) => item.id === Number(returnSelectedItemId));
    const qty = Number(returnQtyInput);
    const enteredAmount = Number(returnAmountInput);

    if (!selected) {
      setQtyWarningMessage('Please select a return item from the list.');
      setQtyWarningOpen(true);
      return;
    }

    if (!qty || qty <= 0) {
      setQtyWarningMessage('Please enter a valid return quantity.');
      setQtyWarningOpen(true);
      return;
    }

    const normalizedAmount = enteredAmount > 0
      ? enteredAmount
      : qty * Number(selected.sell_price || 0);

    if (!normalizedAmount || normalizedAmount <= 0) {
      setQtyWarningMessage('Please enter a valid return amount.');
      setQtyWarningOpen(true);
      return;
    }

    setReturnLines((prev) => {
      const exists = prev.find((line) => line.inventory_item_id === selected.id);
      if (exists) {
        return prev.map((line) =>
          line.inventory_item_id === selected.id
            ? {
                ...line,
                quantity: line.quantity + qty,
                amount: line.amount + normalizedAmount,
                is_damaged: inlineReturnMode === 'deduct' ? (line.is_damaged || returnDamageInput) : line.is_damaged,
              }
            : line
        );
      }

      return [
        ...prev,
        {
          inventory_item_id: selected.id,
          item_code: selected.code,
          item_name: selected.name,
          unit: selected.unit,
          quantity: qty,
          unit_price: selected.sell_price,
          amount: normalizedAmount,
          is_damaged: inlineReturnMode === 'deduct' ? returnDamageInput : false,
        },
      ];
    });

    setReturnSelectedItemId('');
    setReturnSearch('');
    setReturnQtyInput('');
    setReturnAmountInput('');
    setReturnDamageInput(false);
    setShowReturnSuggestions(false);
  };

  const removeReturnLine = (id: number) => {
    setReturnLines((prev) => prev.filter((line) => line.inventory_item_id !== id));
  };

  const openReturnModal = (invoice: InvoiceRecord) => {
    setReturnInvoice(invoice);
    setReturnLineId('');
    setReturnQty('');
    setSettlementType('bill_deduction');
    setSettlementAmount('');
    setExchangeItemId('');
    setExchangeQty('');
    setReturnReason('');
    setReturnNotes('');
    setShowReturnModal(true);
  };

  const selectedReturnLine = returnInvoice?.items?.find((line) => line.id === Number(returnLineId));
  const computedReturnAmount = selectedReturnLine
    ? (Number(returnQty || 0) * Number(selectedReturnLine.unit_price || 0))
    : 0;

  const submitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnInvoice || !selectedReturnLine) {
      setQtyWarningMessage('Please select an invoice item to return.');
      setQtyWarningOpen(true);
      return;
    }

    const qty = Number(returnQty);
    if (!qty || qty <= 0) {
      setQtyWarningMessage('Please enter a valid return quantity.');
      setQtyWarningOpen(true);
      return;
    }

    if (qty > Number(selectedReturnLine.quantity)) {
      setQtyWarningMessage('Return quantity cannot exceed invoiced quantity.');
      setQtyWarningOpen(true);
      return;
    }

    if (settlementType === 'item_exchange' && (!exchangeItemId || Number(exchangeQty) <= 0)) {
      setQtyWarningMessage('Select exchange item and quantity.');
      setQtyWarningOpen(true);
      return;
    }

    try {
      setReturnSaving(true);
      await axios.post('/api/distribution/returns', {
        return_number: `RET-${Date.now()}`,
        distribution_invoice_id: returnInvoice.id,
        customer_id: returnInvoice.customer_id,
        returned_inventory_item_id: selectedReturnLine.inventory_item_id,
        return_date: new Date().toISOString().split('T')[0],
        total_quantity: qty,
        total_amount: computedReturnAmount,
        settlement_type: settlementType,
        settlement_amount: Number(settlementAmount || computedReturnAmount || 0),
        exchange_inventory_item_id: settlementType === 'item_exchange' ? Number(exchangeItemId) : null,
        exchange_quantity: settlementType === 'item_exchange' ? Number(exchangeQty || 0) : 0,
        reason: returnReason || null,
        notes: returnNotes || null,
      }, { headers: { Authorization: `Bearer ${token}` } });

      setShowReturnModal(false);
      setReturnInvoice(null);
      fetchData();
    } catch (error: any) {
      setQtyWarningMessage(error?.response?.data?.message || 'Failed to process return');
      setQtyWarningOpen(true);
    } finally {
      setReturnSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 distribution-invoices-page relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute -top-10 -left-16 w-72 h-72 bg-emerald-200/60 rounded-full blur-3xl"></div>
        <div className="absolute top-24 right-0 w-80 h-80 bg-teal-200/50 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-cyan-200/50 rounded-full blur-3xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-md shadow-sm border-b border-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 h-auto">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg flex items-center justify-center text-white text-lg">
                  🧾
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-semibold text-gray-900">Distribution Invoices</h1>
                  <p className="text-xs text-gray-500">Create and manage customer invoices</p>
                </div>
              </div>
            </div>
            <div className="flex justify-start sm:justify-end">
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
              Invoices <span className="bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent">Control Hub</span>
            </h1>
            <p className="mt-2 text-sm sm:text-base md:text-lg text-gray-600">
              Create and track distribution invoices.
            </p>
            {assignedRouteIds.length > 0 && (
              <p className="mt-1 text-sm text-green-700 font-medium">Auto route filter enabled from allocated load.</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 w-full sm:w-auto transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => router.push('/dashboard/distribution')}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 w-full sm:w-auto transition-colors"
            >
              Distribution Home
            </button>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 border border-transparent rounded-md text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700 w-full sm:w-auto shadow-lg shadow-emerald-200/50 transition-all"
            >
              Add Invoice
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-lg p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-800">Advanced Search</h3>
            <button
              type="button"
              onClick={() => {
                setInvoiceSearch('');
                setInvoiceDateFilter('');
                setCustomerSearch('');
                if (isAdmin) setSelectedLoadFilter('');
              }}
              className="text-xs text-gray-600 hover:text-gray-800 underline"
            >
              Clear Filters
            </button>
          </div>

          <div className={`grid grid-cols-1 gap-3 sm:gap-4 items-end ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Invoice ID / Number</label>
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="e.g. 1024 or INV-202603"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Date</label>
              <input
                type="date"
                value={invoiceDateFilter}
                onChange={(e) => setInvoiceDateFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer Name</label>
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Type customer shop name"
                className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
              />
            </div>

            {isAdmin && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Filter By Load</label>
                <select
                  value={selectedLoadFilter}
                  onChange={(e) => setSelectedLoadFilter(e.target.value)}
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                >
                  <option value="">All Loads</option>
                  {availableLoads.map((load) => (
                    <option key={load.id} value={String(load.id)}>
                      {load.load_number || `Load #${load.id}`} {load.load_date ? `(${formatLoadDate(load.load_date)})` : ''} {load.status ? `- ${load.status}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mt-2 text-xs text-gray-500">
            Showing {filteredInvoices.length} invoice(s)
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-emerald-50">
            <h3 className="text-sm font-semibold text-gray-800">Delivery Orders By Load</h3>
            <p className="text-xs text-gray-500 mt-0.5">DO records created from Outlet POS orders with assigned loads.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DO #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Load</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDeliveryOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                      No DO records found for the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredDeliveryOrders.map((record) => (
                    <tr key={record.id} className="hover:bg-cyan-50/40 transition-colors">
                      <td className="px-4 py-2 text-sm font-semibold text-cyan-700">{record.do_number || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{record.sale_number}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{record.load_id ? `Load #${record.load_id}` : '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{record.customer_name || 'Walk-in Customer'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{record.sale_date ? new Date(record.sale_date).toLocaleDateString() : '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(record.total_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {record.outlet?.name || '-'}
                        {record.outlet?.code ? ` (${record.outlet.code})` : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
            Showing {filteredDeliveryOrders.length} DO record(s)
          </div>
        </div>

        <div className="rounded-xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-emerald-50 to-cyan-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">No invoices yet.</td>
                  </tr>
                ) : (
                  pagedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-emerald-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.invoice_number}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{invoice.customer?.shop_name || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right">{Number(invoice.total).toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{invoice.status}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEditInvoice(invoice)}
                            className="text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-1 rounded-md text-sm font-medium border border-green-200"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openViewInvoice(invoice)}
                            className="text-gray-700 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1 rounded-md text-sm font-medium border border-gray-200"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handlePosPrint(invoice)}
                            className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-md text-sm font-medium"
                          >
                            POS Print
                          </button>
                          <button
                            onClick={() => handleDeleteInvoice(invoice)}
                            className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md text-sm font-medium border border-red-200"
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

          <div className="md:hidden divide-y divide-gray-200">
            {filteredInvoices.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-gray-500">No invoices yet.</div>
            ) : pagedInvoices.map((invoice) => (
              <div key={invoice.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</p>
                  <span className="text-xs text-gray-600">{invoice.status}</span>
                </div>
                <p className="text-sm text-gray-700">{invoice.customer?.shop_name || '-'}</p>
                <p className="text-xs text-gray-500">{new Date(invoice.invoice_date).toLocaleDateString()}</p>
                <p className="text-sm font-medium text-gray-900">Total: {Number(invoice.total).toFixed(2)}</p>
                <div className="pt-1 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => startEditInvoice(invoice)}
                    className="flex-1 text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-3 py-2 rounded-md text-sm font-medium border border-green-200"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => openViewInvoice(invoice)}
                    className="flex-1 text-gray-700 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-md text-sm font-medium border border-gray-200"
                  >
                    View
                  </button>
                  <button
                    onClick={() => handlePosPrint(invoice)}
                    className="flex-1 text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-md text-sm font-medium"
                  >
                    POS Print
                  </button>
                  <button
                    onClick={() => handleDeleteInvoice(invoice)}
                    className="flex-1 text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-md text-sm font-medium border border-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredInvoices.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-600">
              <div>
                {(() => {
                  const start = (currentPage - 1) * pageSize + 1;
                  const end = Math.min(filteredInvoices.length, currentPage * pageSize);
                  return `Showing ${start}–${end} of ${filteredInvoices.length} invoices`;
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
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 px-2 py-3 backdrop-blur-sm md:items-center md:px-4">
          <div className="relative mx-auto flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/92 shadow-[0_35px_120px_-45px_rgba(16,185,129,0.6)] md:h-auto md:max-h-[92vh]">
            <div className="flex items-start justify-between border-b border-slate-200/80 bg-gradient-to-r from-emerald-50/80 via-white to-cyan-50/70 px-4 pb-3 pt-4 backdrop-blur-sm md:px-6">
              <div>
                <h3 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg md:text-xl">Create Invoice</h3>
                <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">Select shop, add items, and optionally record payment in one flow.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetInvoiceForm();
                }}
                className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="invoice-modal-scroll flex-1 overflow-y-auto overscroll-contain px-4 md:px-6 pb-4 md:pb-6">
              <form onSubmit={submitInvoice} className="space-y-6 pt-4">
                <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-cyan-50/50 p-3 shadow-sm sm:p-4">
                  <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Invoice details</h4>
                      <p className="text-xs text-slate-500">Basic information for this bill.</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                      <span>{assignedRouteIds.length > 0 ? `Auto route filter active (${assignedRouteIds.length} route${assignedRouteIds.length > 1 ? 's' : ''})` : 'No route filter'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Number</label>
                      <input
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        required
                        className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Shop</label>
                      <div ref={customerPickerRef} className="relative">
                        <input
                          type="text"
                          value={customerPickerSearch}
                          onChange={(e) => {
                            setCustomerPickerSearch(e.target.value);
                            setCustomerId('');
                            setShowCustomerPicker(true);
                            setHighlightedCustomerIndex(-1);
                          }}
                          onFocus={() => {
                            setShowCustomerPicker(true);
                            setHighlightedCustomerIndex(-1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              if (!showCustomerPicker) {
                                setShowCustomerPicker(true);
                              }
                              if (customerSuggestions.length > 0) {
                                setHighlightedCustomerIndex((prev) =>
                                  prev < customerSuggestions.length - 1 ? prev + 1 : 0
                                );
                              }
                              return;
                            }

                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              if (!showCustomerPicker) {
                                setShowCustomerPicker(true);
                              }
                              if (customerSuggestions.length > 0) {
                                setHighlightedCustomerIndex((prev) =>
                                  prev > 0 ? prev - 1 : customerSuggestions.length - 1
                                );
                              }
                              return;
                            }

                            if (e.key === 'Enter') {
                              if (showCustomerPicker && customerSuggestions.length > 0) {
                                e.preventDefault();
                                const pickedIndex = highlightedCustomerIndex >= 0 ? highlightedCustomerIndex : 0;
                                const picked = customerSuggestions[pickedIndex];
                                if (picked) {
                                  setCustomerId(String(picked.id));
                                  setCustomerPickerSearch(`${picked.shop_name} (${picked.customer_code})`);
                                  setShowCustomerPicker(false);
                                  setHighlightedCustomerIndex(-1);
                                }
                              }
                              return;
                            }

                            if (e.key === 'Escape') {
                              setShowCustomerPicker(false);
                              setHighlightedCustomerIndex(-1);
                            }
                          }}
                          placeholder="Type shop name or customer code"
                          className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                        />

                        {showCustomerPicker && customerSuggestions.length > 0 && (
                          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-emerald-100 bg-white shadow-xl">
                            {customerSuggestions.map((customer, index) => {
                              const isHighlighted = index === highlightedCustomerIndex;
                              const isSelected = selectedCustomer?.id === customer.id;
                              return (
                                <button
                                  key={customer.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setCustomerId(String(customer.id));
                                    setCustomerPickerSearch(`${customer.shop_name} (${customer.customer_code})`);
                                    setShowCustomerPicker(false);
                                    setHighlightedCustomerIndex(-1);
                                  }}
                                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                                    isHighlighted
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : isSelected
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : 'text-slate-800 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="font-medium">{customer.shop_name}</span>
                                  <span className="text-xs text-slate-500">{customer.customer_code}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {showCustomerPicker && customerSuggestions.length === 0 && customerPickerSearch.trim() && (
                          <div className="absolute z-20 mt-1 w-full rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-500 shadow-xl">
                            No matching shop found.
                          </div>
                        )}
                      </div>
                      {selectedCustomer && (
                        <p className="mt-1 text-xs text-gray-500">
                          Selected: {selectedCustomer.shop_name} ({selectedCustomer.customer_code})
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Date</label>
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-4 rounded-2xl border border-cyan-100 bg-gradient-to-br from-white via-cyan-50/50 to-slate-50/70 p-3 shadow-sm sm:p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Items</h4>
                      <p className="text-xs text-slate-500">Search stock, add quantity, then review the lines.</p>
                    </div>
                    <div className="hidden md:flex flex-col items-end rounded-xl border border-cyan-100 bg-white/80 px-3 py-2 text-xs text-slate-600">
                      <span>Subtotal: <span className="font-semibold text-slate-900">{subtotal.toFixed(2)}</span></span>
                      <span>Bill total (before returns): <span className="font-semibold text-slate-900">{invoiceTotalBeforeReturns.toFixed(2)}</span></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-12 md:items-end">
                    <div className="md:col-span-5">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={itemSearch}
                          onChange={(e) => {
                            setItemSearch(e.target.value);
                            setSelectedItemId('');
                            setSelectedLoadItemId('');
                            setShowItemDropdown(true);
                            setHighlightedItemIndex(-1);
                          }}
                          onFocus={() => {
                            setShowItemDropdown(true);
                            setHighlightedItemIndex(-1);
                          }}
                          onKeyDown={(e) => {
                            if (!showItemDropdown || filteredItems.length === 0) return;

                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setHighlightedItemIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setHighlightedItemIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
                            } else if (e.key === 'Enter') {
                              e.preventDefault();
                              const targetIndex = highlightedItemIndex >= 0 ? highlightedItemIndex : 0;
                              const picked = filteredItems[targetIndex];
                              if (picked) {
                                setSelectedItemId(String(picked.inventory_item_id));
                                setSelectedLoadItemId(String(picked.load_item_id));
                                setItemSearch(`${picked.item_code} - ${picked.item_name} | ${picked.sell_price.toFixed(2)}`);
                                setShowItemDropdown(false);
                                setHighlightedItemIndex(-1);
                              }
                            } else if (e.key === 'Escape') {
                              setShowItemDropdown(false);
                              setHighlightedItemIndex(-1);
                            }
                          }}
                          placeholder="Type item code or name (from selected load)"
                          className="w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                        />
                        {showItemDropdown && filteredItems.length > 0 && (
                          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-cyan-100 bg-white shadow-xl">
                            {filteredItems.map((item, index) => {
                              return (
                                <button
                                  key={item.load_item_id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedItemId(String(item.inventory_item_id));
                                    setSelectedLoadItemId(String(item.load_item_id));
                                    setItemSearch(`${item.item_code} - ${item.item_name} | ${item.sell_price.toFixed(2)}`);
                                    setShowItemDropdown(false);
                                    setHighlightedItemIndex(-1);
                                  }}
                                  className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                                    highlightedItemIndex === index ? 'bg-cyan-100' : 'hover:bg-cyan-50'
                                  }`}
                                >
                                  <div className="text-sm font-medium text-slate-900">{item.item_code} - {item.item_name}</div>
                                  <div className="text-xs text-slate-500">
                                    {`Load: ${item.load_qty.toFixed(2)} ${item.unit} | Stock: ${item.warehouse_stock} ${item.unit} | Price: ${item.sell_price.toFixed(2)}`}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {showItemDropdown && itemSearch.trim() && filteredItems.length === 0 && (
                          <div className="absolute z-20 mt-1 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm text-slate-500 shadow-xl">
                            {activeLoadId
                              ? 'No matching items found in this load.'
                              : 'Select a load first to search load items.'}
                          </div>
                        )}
                      </div>
                      {selectedItem && (
                        (() => {
                          const matchingLoad = loadItems.find(
                            (li) => String(li.id) === String(selectedLoadItemId)
                          );
                          const priceFromLoad = matchingLoad && matchingLoad.sell_price > 0
                            ? matchingLoad.sell_price
                            : selectedItem.sell_price;

                          return (
                            <p className="mt-1 text-xs text-green-700">
                              Selected: {selectedItem.name}
                              {matchingLoad
                                ? ` | Load: ${Number(matchingLoad.qty).toFixed(2)} ${selectedItem.unit}`
                                : ''}
                              {` | Warehouse: ${selectedItem.current_stock} ${selectedItem.unit}`}
                              {` | Price: ${priceFromLoad.toFixed(2)}`}
                            </p>
                          );
                        })()
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Qty (Paid)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={lineQty}
                        onChange={(e) => setLineQty(e.target.value)}
                        className="w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Free Qty</label>
                      <input
                        type="number"
                        step="0.01"
                        value={lineFreeQty}
                        onChange={(e) => setLineFreeQty(e.target.value)}
                        className="w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Item Discount</label>
                      <div className="flex gap-2">
                        <select
                          value={lineItemDiscountType}
                          onChange={(e) => setLineItemDiscountType(e.target.value as 'percentage' | 'amount')}
                          className="w-1/2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                        >
                          <option value="percentage">%</option>
                          <option value="amount">Amount</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={lineItemDiscountType === 'percentage' ? 100 : undefined}
                          step="0.01"
                          placeholder="0"
                          value={lineItemDiscount}
                          onChange={(e) => setLineItemDiscount(e.target.value)}
                          className="w-1/2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {lineItemDiscountType === 'percentage'
                          ? 'Percentage discount on base unit price (0-100).'
                          : 'Fixed discount amount per paid unit.'}
                      </p>
                    </div>
                    <div className="md:col-span-1">
                      <button
                        type="button"
                        onClick={addLine}
                        className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-200/70 transition hover:from-cyan-700 hover:to-blue-700"
                      >
                        Add Line
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Ref GPS</label>
                        <button
                          type="button"
                          onClick={() => captureGpsSnapshot('ref')}
                          disabled={capturingGpsTarget !== null}
                          className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {capturingGpsTarget === 'ref' ? 'Capturing...' : (refGpsSnapshot ? 'Recapture' : 'Capture GPS')}
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-emerald-800 break-words">{formatGpsSnapshot(refGpsSnapshot)}</p>
                    </div>

                    <div className="rounded-xl border border-cyan-200 bg-cyan-50/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Billing GPS</label>
                        <button
                          type="button"
                          onClick={() => captureGpsSnapshot('billing')}
                          disabled={capturingGpsTarget !== null}
                          className="rounded-lg border border-cyan-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-60"
                        >
                          {capturingGpsTarget === 'billing' ? 'Capturing...' : (billingGpsSnapshot ? 'Recapture' : 'Capture GPS')}
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-cyan-800 break-words">{formatGpsSnapshot(billingGpsSnapshot)}</p>
                    </div>
                  </div>

                  <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-100/80">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Qty (Paid)</th>
                          <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Free Qty</th>
                          <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Disc %</th>
                          <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Unit Price</th>
                          <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Line Total</th>
                          <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {lines.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-8 text-center text-slate-500"
                            >
                              No lines added.
                            </td>
                          </tr>
                        ) : (
                          lines.map((line) => {
                            const freeQty = line.free_quantity || 0;
                            const paidQty =
                              typeof line.paid_quantity === 'number'
                                ? line.paid_quantity
                                : line.quantity - freeQty;
                            const isEditing = editingLineId === line.line_id;
                            return (
                              <tr key={line.line_id}>
                                <td className="px-4 py-2 text-sm text-gray-700">
                                  {line.item_name} ({line.item_code})
                                </td>
                                <td className="px-4 py-1 text-sm text-gray-700 text-right align-middle">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={paidQty}
                                      onChange={(e) =>
                                        updateLineQuantities(
                                          line.line_id,
                                          Number(e.target.value) || 0,
                                          freeQty
                                        )
                                      }
                                      className="w-24 rounded-md border border-gray-300 text-right text-sm text-black px-2 py-1"
                                    />
                                  ) : (
                                    <span>{paidQty.toFixed(2)} {line.unit}</span>
                                  )}
                                </td>
                                <td className="px-4 py-1 text-sm text-gray-700 text-right align-middle">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={freeQty}
                                      onChange={(e) =>
                                        updateLineQuantities(
                                          line.line_id,
                                          paidQty,
                                          Number(e.target.value) || 0
                                        )
                                      }
                                      className="w-24 rounded-md border border-gray-300 text-right text-sm text-black px-2 py-1"
                                    />
                                  ) : (
                                    <span>{freeQty.toFixed(2)} {line.unit}</span>
                                  )}
                                </td>
                                <td className="px-4 py-1 text-sm text-gray-700 text-right align-middle">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step="0.01"
                                      value={getLineDiscountPercent(line)}
                                      onChange={(e) =>
                                        updateLineDiscountPercent(
                                          line.line_id,
                                          Number(e.target.value) || 0
                                        )
                                      }
                                      className="w-24 rounded-md border border-gray-300 text-right text-sm text-black px-2 py-1"
                                    />
                                  ) : (
                                    <span>{getLineDiscountPercent(line).toFixed(2)}%</span>
                                  )}
                                </td>
                                <td className="px-4 py-1 text-sm text-gray-700 text-right align-middle">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={line.unit_price}
                                      onChange={(e) =>
                                        updateLineUnitPrice(
                                          line.line_id,
                                          Number(e.target.value) || 0
                                        )
                                      }
                                      className="w-24 rounded-md border border-gray-300 text-right text-sm text-black px-2 py-1"
                                    />
                                  ) : (
                                    <span>{line.unit_price.toFixed(2)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-700 text-right">
                                  {(paidQty * line.unit_price).toFixed(2)}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <div className="flex justify-end gap-2">
                                    {isEditing ? (
                                      <button
                                        type="button"
                                        onClick={() => setEditingLineId(null)}
                                        className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                      >
                                        Done
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setEditingLineId(line.line_id)}
                                        className="px-2 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                      >
                                        Edit
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeLine(line.line_id)}
                                      className="px-2 py-1 text-xs rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-2 text-right text-sm font-semibold text-gray-700"
                          >
                            Discount
                          </td>
                          <td className="px-4 py-2 text-right text-sm font-semibold text-gray-700">
                            {discountAmount.toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-2 text-right text-sm font-semibold text-gray-700"
                          >
                            Bill total (before returns)
                          </td>
                          <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">
                            {invoiceTotalBeforeReturns.toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white md:hidden">
                {lines.length === 0 ? (
                  <div className="px-4 py-4 text-center text-sm text-gray-500">No lines added.</div>
                ) : (
                  lines.map((line) => {
                    const freeQty = line.free_quantity || 0;
                    const paidQty =
                      typeof line.paid_quantity === 'number'
                        ? line.paid_quantity
                        : line.quantity - freeQty;
                    const isEditing = editingLineId === line.line_id;
                    return (
                      <div
                        key={line.line_id}
                        className="px-4 py-3 text-sm text-gray-700 flex justify-between gap-3"
                      >
                        <div>
                          <div className="font-medium">{line.item_name}</div>
                          <div className="text-xs text-gray-500">{line.item_code}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            Qty: {line.quantity.toFixed(2)} {line.unit}
                          </div>
                          {(freeQty > 0 || (line.item_discount || 0) > 0) && (
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {freeQty > 0 && (
                                <span>Free: {freeQty.toFixed(2)} {line.unit}</span>
                              )}
                              {freeQty > 0 && (line.item_discount || 0) > 0 && (
                                <span className="mx-1">·</span>
                              )}
                              {(line.item_discount || 0) > 0 && (
                                <span>Disc: {getLineDiscountPercent(line).toFixed(2)}%</span>
                              )}
                            </div>
                          )}
                          {isEditing && (
                            <div className="mt-2 space-y-1 text-[11px] text-gray-700">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Qty (Paid)</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={paidQty}
                                  onChange={(e) =>
                                    updateLineQuantities(
                                      line.line_id,
                                      Number(e.target.value) || 0,
                                      freeQty
                                    )
                                  }
                                  className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Free Qty</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={freeQty}
                                  onChange={(e) =>
                                    updateLineQuantities(
                                      line.line_id,
                                      paidQty,
                                      Number(e.target.value) || 0
                                    )
                                  }
                                  className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Disc %</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step="0.01"
                                  value={getLineDiscountPercent(line)}
                                  onChange={(e) =>
                                    updateLineDiscountPercent(
                                      line.line_id,
                                      Number(e.target.value) || 0
                                    )
                                  }
                                  className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500">Unit Price</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.unit_price}
                                  onChange={(e) =>
                                    updateLineUnitPrice(
                                      line.line_id,
                                      Number(e.target.value) || 0
                                    )
                                  }
                                  className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500">Unit</div>
                          <div className="text-sm font-medium">{line.unit_price.toFixed(2)}</div>
                          <div className="text-xs text-gray-500 mt-1">Total</div>
                          <div className="text-sm font-semibold">
                            {(paidQty * line.unit_price).toFixed(2)}
                          </div>
                          <div className="mt-2 flex justify-end gap-2">
                            {isEditing ? (
                              <button
                                type="button"
                                onClick={() => setEditingLineId(null)}
                                className="px-2 py-1 text-[11px] rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                              >
                                Done
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingLineId(line.line_id)}
                                className="px-2 py-1 text-[11px] rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeLine(line.line_id)}
                              className="px-2 py-1 text-[11px] rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div className="px-4 py-2 bg-gray-50 flex justify-between text-sm font-semibold text-gray-700">
                  <span>Discount</span>
                  <span>{discountAmount.toFixed(2)}</span>
                </div>
                <div className="px-4 py-2 bg-gray-100 flex justify-between text-sm font-bold text-gray-900 rounded-b-lg">
                  <span>Bill total (before returns)</span>
                  <span>{invoiceTotalBeforeReturns.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-dashed border-slate-300 pt-3 text-sm sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Discount</label>
                  <div className="flex gap-2">
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as 'amount' | 'percentage')}
                      className="w-1/2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                    >
                      <option value="amount">Amount</option>
                      <option value="percentage">%</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className="w-1/2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                    />
                  </div>
                </div>
                <div className="flex sm:items-end justify-between sm:justify-end">
                  <div className="text-xs text-gray-600 text-right">
                    <div>
                      Discount value: <span className="font-semibold text-gray-900">{discountAmount.toFixed(2)}</span>
                    </div>
                    <div>
                      Bill total (before returns): <span className="font-semibold text-gray-900">{invoiceTotalBeforeReturns.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

            </section>

            <section className="mt-2 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50/70 via-white to-emerald-50/45 p-3 shadow-sm sm:p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-amber-100 bg-white/90 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-800">Item Returns (Expired / Damaged)</h4>
                    <span className="text-xs text-gray-500">Optional</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Search products, enter return quantity, and we will calculate the value of expired or damaged items returned on this visit.
                  </p>

                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-gray-600 mb-1">
                      <div className="inline-flex rounded-full border border-amber-200 bg-white p-1">
                        <button
                          type="button"
                          onClick={() => setInlineReturnMode('deduct')}
                          className={`px-2.5 py-1 rounded-full border text-xs font-medium ${
                            inlineReturnMode === 'deduct'
                              ? 'border-green-600 bg-green-600 text-white'
                              : 'bg-transparent text-gray-700 border-transparent'
                          }`}
                        >
                          Deduct from invoice
                        </button>
                        <button
                          type="button"
                          onClick={() => setInlineReturnMode('exchange')}
                          className={`ml-1 px-2.5 py-1 rounded-full border text-xs font-medium ${
                            inlineReturnMode === 'exchange'
                              ? 'border-green-200 bg-emerald-50 text-green-700'
                              : 'bg-transparent text-gray-700 border-transparent'
                          }`}
                        >
                          Exchange only
                        </button>
                      </div>
                      <div className="text-right">
                        <span className="block">Return total: <span className="font-semibold text-gray-900">{totalReturnValue.toFixed(2)}</span></span>
                        <span className="block text-[10px] text-gray-500">
                          {inlineReturnMode === 'deduct'
                            ? 'Will reduce this invoice amount (amount field based).'
                            : 'For exchange only, invoice amount unchanged.'}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Return Item</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={returnSearch}
                            onChange={(e) => {
                              const value = e.target.value;
                              setReturnSearch(value);
                              setReturnSelectedItemId('');
                              setShowReturnSuggestions(!!value.trim());
                            }}
                            onFocus={() => {
                              if (returnSearch.trim()) {
                                setShowReturnSuggestions(true);
                              }
                            }}
                            placeholder="Type item code or name"
                            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                          />
                          {showReturnSuggestions && returnSuggestionItems.length > 0 && (
                            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-amber-100 bg-white shadow-xl">
                              {returnSuggestionItems.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleReturnSuggestionClick(item)}
                                  className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-green-50"
                                >
                                  <div className="text-xs font-medium text-gray-900">{item.code} - {item.name}</div>
                                  <div className="text-[11px] text-gray-500">Stock: {item.current_stock} {item.unit}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Return Qty</label>
                        <input
                          type="number"
                          step="0.01"
                          value={returnQtyInput}
                          onChange={(e) => {
                            const value = e.target.value;
                            setReturnQtyInput(value);
                            const selected = items.find((item) => item.id === Number(returnSelectedItemId));
                            if (selected) {
                              const qty = Number(value || 0);
                              setReturnAmountInput(qty > 0 ? (qty * Number(selected.sell_price || 0)).toFixed(2) : '');
                            }
                          }}
                            className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={returnAmountInput}
                          onChange={(e) => setReturnAmountInput(e.target.value)}
                          className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Damage Mark</label>
                        <label className="inline-flex h-[42px] w-full items-center justify-center rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
                          <input
                            type="checkbox"
                            className="mr-2"
                            checked={returnDamageInput}
                            disabled={inlineReturnMode !== 'deduct'}
                            onChange={(e) => setReturnDamageInput(e.target.checked)}
                          />
                          Damaged
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={addReturnLine}
                        className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 px-3 py-1 text-xs font-semibold text-white shadow-md shadow-amber-200/70 transition hover:from-amber-600 hover:to-orange-700"
                      >
                        Add Return
                      </button>
                    </div>

                    {returnLines.length > 0 && (
                      <div className="mt-2">
                        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
                          <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-100/80">
                              <tr>
                                <th className="px-3 py-1 text-left text-[11px] font-medium text-gray-500 uppercase">Item</th>
                                <th className="px-3 py-1 text-right text-[11px] font-medium text-gray-500 uppercase">Qty</th>
                                <th className="px-3 py-1 text-right text-[11px] font-medium text-gray-500 uppercase">Rate</th>
                                <th className="px-3 py-1 text-right text-[11px] font-medium text-gray-500 uppercase">Amount</th>
                                {inlineReturnMode === 'deduct' && (
                                  <th className="px-3 py-1 text-center text-[11px] font-medium text-gray-500 uppercase">Damage</th>
                                )}
                                <th className="px-3 py-1 text-right text-[11px] font-medium text-gray-500 uppercase">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {returnLines.map((line) => {
                                const isEditing = editingReturnId === line.inventory_item_id;
                                return (
                                  <tr key={line.inventory_item_id}>
                                    <td className="px-3 py-1 text-[11px] text-gray-700">{line.item_name} ({line.item_code})</td>
                                    <td className="px-3 py-1 text-[11px] text-gray-700 text-right align-middle">
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={line.quantity}
                                          onChange={(e) =>
                                            updateReturnLine(
                                              line.inventory_item_id,
                                              { quantity: Number(e.target.value) || 0 }
                                            )
                                          }
                                          className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                        />
                                      ) : (
                                        <span>{line.quantity.toFixed(2)}</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1 text-[11px] text-gray-700 text-right align-middle">
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={line.unit_price}
                                          onChange={(e) =>
                                            updateReturnLine(
                                              line.inventory_item_id,
                                              { unit_price: Number(e.target.value) || 0 }
                                            )
                                          }
                                          className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                        />
                                      ) : (
                                        <span>{line.unit_price.toFixed(2)}</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1 text-[11px] text-gray-700 text-right align-middle">
                                      {isEditing ? (
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={line.amount}
                                          onChange={(e) =>
                                            updateReturnLine(
                                              line.inventory_item_id,
                                              { amount: Number(e.target.value) || 0 }
                                            )
                                          }
                                          className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                        />
                                      ) : (
                                        <span>{line.amount.toFixed(2)}</span>
                                      )}
                                    </td>
                                    {inlineReturnMode === 'deduct' && (
                                      <td className="px-3 py-1 text-center align-middle">
                                        {isEditing ? (
                                          <input
                                            type="checkbox"
                                            checked={line.is_damaged}
                                            onChange={(e) =>
                                              updateReturnLine(
                                                line.inventory_item_id,
                                                { is_damaged: e.target.checked }
                                              )
                                            }
                                          />
                                        ) : (
                                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${line.is_damaged ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {line.is_damaged ? 'Damaged' : 'Normal'}
                                          </span>
                                        )}
                                      </td>
                                    )}
                                    <td className="px-3 py-1 text-right">
                                      <div className="flex justify-end gap-1">
                                        {isEditing ? (
                                          <button
                                            type="button"
                                            onClick={() => setEditingReturnId(null)}
                                            className="px-2 py-0.5 text-[10px] rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                          >
                                            Done
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setEditingReturnId(line.inventory_item_id)}
                                            className="px-2 py-0.5 text-[10px] rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                          >
                                            Edit
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => removeReturnLine(line.inventory_item_id)}
                                          className="px-2 py-0.5 text-[10px] rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-gray-50">
                              <tr>
                                <td colSpan={inlineReturnMode === 'deduct' ? 4 : 3} className="px-3 py-1 text-right text-xs font-semibold text-gray-700">Total Return Value</td>
                                <td className="px-3 py-1 text-right text-xs font-bold text-gray-900">{totalReturnValue.toFixed(2)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white md:hidden">
                          {returnLines.map((line) => {
                            const isEditing = editingReturnId === line.inventory_item_id;
                            return (
                              <div
                                key={line.inventory_item_id}
                                className="px-3 py-2 text-xs text-gray-700 flex justify-between gap-3"
                              >
                                <div className="flex-1">
                                  <div className="font-medium text-[11px]">{line.item_name}</div>
                                  <div className="text-[10px] text-gray-500">{line.item_code}</div>
                                  {isEditing ? (
                                    <div className="mt-1">
                                      <label className="block text-[10px] text-gray-500 mb-0.5">Qty</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={line.quantity}
                                        onChange={(e) =>
                                          updateReturnLine(
                                            line.inventory_item_id,
                                            { quantity: Number(e.target.value) || 0 }
                                          )
                                        }
                                        className="w-full rounded-md border border-gray-300 text-right text-[11px] text-black px-2 py-1"
                                      />
                                    </div>
                                  ) : (
                                    <div className="text-[10px] text-gray-500 mt-1">
                                      Qty: <span className="font-medium text-gray-700">{line.quantity.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-gray-500">Unit</div>
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={line.unit_price}
                                      onChange={(e) =>
                                        updateReturnLine(
                                          line.inventory_item_id,
                                          { unit_price: Number(e.target.value) || 0 }
                                        )
                                      }
                                      className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                    />
                                  ) : (
                                    <div className="text-[11px] font-medium">{line.unit_price.toFixed(2)}</div>
                                  )}
                                  <div className="text-[10px] text-gray-500 mt-1">Amount</div>
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={line.amount}
                                      onChange={(e) =>
                                        updateReturnLine(
                                          line.inventory_item_id,
                                          { amount: Number(e.target.value) || 0 }
                                        )
                                      }
                                      className="w-20 rounded-md border border-gray-300 text-right text-[11px] text-black px-1 py-0.5"
                                    />
                                  ) : (
                                    <div className="text-[11px] font-semibold">{line.amount.toFixed(2)}</div>
                                  )}
                                  {inlineReturnMode === 'deduct' && (
                                    <div className="mt-1">
                                      {isEditing ? (
                                        <label className="inline-flex items-center text-[10px] text-gray-600">
                                          <input
                                            type="checkbox"
                                            className="mr-1"
                                            checked={line.is_damaged}
                                            onChange={(e) =>
                                              updateReturnLine(
                                                line.inventory_item_id,
                                                { is_damaged: e.target.checked }
                                              )
                                            }
                                          />
                                          Damaged
                                        </label>
                                      ) : (
                                        <div className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${line.is_damaged ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                          {line.is_damaged ? 'Damaged' : 'Normal'}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="text-[10px] text-gray-500 mt-1">Value</div>
                                  <div className="text-[11px] font-semibold">{line.amount.toFixed(2)}</div>
                                  <div className="mt-1 flex justify-end gap-1">
                                    {isEditing ? (
                                      <button
                                        type="button"
                                        onClick={() => setEditingReturnId(null)}
                                        className="px-2 py-0.5 text-[10px] rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                      >
                                        Done
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setEditingReturnId(line.inventory_item_id)}
                                        className="px-2 py-0.5 text-[10px] rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                      >
                                        Edit
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeReturnLine(line.inventory_item_id)}
                                      className="px-2 py-0.5 text-[10px] rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          <div className="px-3 py-2 bg-gray-50 flex justify-between text-xs font-semibold text-gray-700 rounded-b-md">
                            <span>Total Return Value</span>
                            <span>{totalReturnValue.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-100 bg-white/90 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-800">Payment Details</h4>
                    <label className="inline-flex items-center text-xs text-gray-600">
                      <input
                        type="checkbox"
                        className="mr-2 rounded border-gray-300"
                        checked={addPayment}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setAddPayment(checked);
                          if (checked) {
                            if (paymentMethod !== 'bill_to_bill') {
                              setPaymentAmount(invoiceFinalTotal.toFixed(2));
                            }
                            setPaymentDate(invoiceDate);
                            setPaymentChequeDate(invoiceDate);
                          }
                        }}
                      />
                      Add payment now
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Record cheque, cash, or bank transfer details together with this invoice.
                  </p>

                  {addPayment && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
                          <select
                            value={paymentMethod}
                            onChange={(e) => {
                              const nextMethod = e.target.value as 'cash' | 'check' | 'bank_transfer' | 'bill_to_bill';
                              setPaymentMethod(nextMethod);
                              if (nextMethod === 'bill_to_bill') {
                                setPaymentAmount('');
                              } else if (addPayment) {
                                setPaymentAmount(invoiceFinalTotal.toFixed(2));
                              }
                              if (nextMethod !== 'check') {
                                setPaymentChequeDate('');
                              } else if (!paymentChequeDate) {
                                setPaymentChequeDate(paymentDate || invoiceDate);
                              }
                            }}
                            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                          >
                            <option value="cash">Cash</option>
                            <option value="check">Cheque</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="bill_to_bill">Bill To Bill</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Payment Date</label>
                          <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                            required={addPayment}
                          />
                        </div>
                        {paymentMethod === 'check' && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Cheque Date</label>
                            <input
                              type="date"
                              value={paymentChequeDate}
                              onChange={(e) => setPaymentChequeDate(e.target.value)}
                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                              required={addPayment}
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {paymentMethod === 'bill_to_bill' ? (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Last Bill Amount</label>
                            <input
                              type="number"
                              step="0.01"
                              value={lastBillAmount}
                              onChange={(e) => setLastBillAmount(e.target.value)}
                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                            />
                            <p className="mt-1 text-[11px] text-emerald-700">
                              Leave empty or 0 to create this invoice as credit. Enter amount to settle previous bill.
                            </p>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                            <input
                              type="number"
                              step="0.01"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                              required={addPayment}
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Reference / Cheque No.</label>
                          <input
                            type="text"
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                            placeholder={
                              paymentMethod === 'check'
                                ? 'Cheque number'
                                : paymentMethod === 'bill_to_bill'
                                  ? 'Adjustment reference'
                                  : 'Bank reference no.'
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Bank Name (optional)</label>
                        <input
                          type="text"
                          value={paymentBankName}
                          onChange={(e) => setPaymentBankName(e.target.value)}
                          className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
                          placeholder="Bank / Branch"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

                <div className="sticky bottom-0 left-0 right-0 mt-1 border-t border-slate-200 bg-white/95 pt-3 backdrop-blur">
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/85 via-white to-cyan-50/70 px-4 py-3 text-sm shadow-[0_14px_40px_-28px_rgba(16,185,129,0.55)]">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Grand Total</span>
                      <span className="text-xl font-extrabold tracking-tight text-slate-900">{invoiceFinalTotal.toFixed(2)}</span>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">
                        Lines: {lines.length}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                        Returns: {totalReturnValue.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-end gap-2 pb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        resetInvoiceForm();
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 sm:w-auto"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full rounded-xl border border-transparent bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 sm:w-auto"
                    >
                      {saving ? 'Saving…' : 'Create Invoice'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {qtyWarningOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-11/12 p-4 border border-red-100">
            <h4 className="text-sm font-semibold text-red-700 mb-2">Notice</h4>
            <p className="text-sm text-gray-700 whitespace-pre-line">{qtyWarningMessage}</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setQtyWarningOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmInvoice && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 px-3">
          <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-5 shadow-2xl">
            <h4 className="text-base font-semibold text-slate-900">Confirm Delete</h4>
            <p className="mt-2 text-sm text-slate-600">
              Delete invoice {deleteConfirmInvoice.invoice_number}? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmInvoice(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteInvoice}
                className="rounded-xl border border-transparent bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-sm font-semibold text-white hover:from-rose-700 hover:to-red-700"
              >
                Delete Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {showReturnModal && returnInvoice && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-3xl shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Return Item - {returnInvoice.invoice_number}</h3>

            <form onSubmit={submitReturn} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Item</label>
                  <select
                    value={returnLineId}
                    onChange={(e) => {
                      setReturnLineId(e.target.value);
                      setReturnQty('');
                      setSettlementAmount('');
                    }}
                    className="w-full rounded-md border border-gray-300 text-black"
                    required
                  >
                    <option value="">Select Item</option>
                    {(returnInvoice.items || []).map((line) => (
                      <option key={line.id} value={line.id}>{line.item_code} - {line.item_name} ({Number(line.quantity).toFixed(2)} {line.unit || ''})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Return Qty</label>
                  <input
                    type="number"
                    step="0.01"
                    value={returnQty}
                    onChange={(e) => {
                      setReturnQty(e.target.value);
                      if (selectedReturnLine) {
                        const amount = Number(e.target.value || 0) * Number(selectedReturnLine.unit_price || 0);
                        setSettlementAmount(amount > 0 ? amount.toFixed(2) : '');
                      }
                    }}
                    className="w-full rounded-md border border-gray-300 text-black"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Settlement Type</label>
                  <select
                    value={settlementType}
                    onChange={(e) => setSettlementType(e.target.value as 'bill_deduction' | 'cash_refund' | 'item_exchange')}
                    className="w-full rounded-md border border-gray-300 text-black"
                  >
                    <option value="bill_deduction">Deduct Bill Amount</option>
                    <option value="cash_refund">Return Cash</option>
                    <option value="item_exchange">Give Items (Exchange)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Settlement Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    className="w-full rounded-md border border-gray-300 text-black"
                  />
                </div>
              </div>

              {settlementType === 'item_exchange' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Exchange Item</label>
                    <select
                      value={exchangeItemId}
                      onChange={(e) => setExchangeItemId(e.target.value)}
                      className="w-full rounded-md border-gray-300 text-black"
                      required
                    >
                      <option value="">Select Exchange Item</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.code} - {item.name} ({item.current_stock} {item.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Exchange Qty</label>
                    <input
                      type="number"
                      step="0.01"
                      value={exchangeQty}
                      onChange={(e) => setExchangeQty(e.target.value)}
                      className="w-full rounded-md border-gray-300 text-black"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <input
                    type="text"
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    className="w-full rounded-md border border-gray-300 text-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    className="w-full rounded-md border border-gray-300 text-black"
                  />
                </div>
              </div>

              <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-700">
                Return Amount: <span className="font-semibold">{computedReturnAmount.toFixed(2)}</span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowReturnModal(false);
                    setReturnInvoice(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={returnSaving}
                  className="px-4 py-2 bg-green-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {returnSaving ? 'Processing...' : 'Process Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewInvoice && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white/95 rounded-2xl shadow-2xl max-w-2xl w-11/12 md:w-[680px] max-h-[90vh] overflow-hidden flex flex-col border border-white/70">
            <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-cyan-50">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Invoice {viewInvoice.invoice_number}</h3>
                <p className="text-xs text-gray-500">
                  {viewInvoice.customer?.shop_name || 'Unknown customer'}
                  {viewInvoice.customer?.customer_code ? ` (${viewInvoice.customer.customer_code})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewInvoice(null)}
                className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              >
                ✕
              </button>
            </div>

            <div className="invoice-return-modal-scroll flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 text-sm text-gray-700">
              <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                <div>
                  <div className="text-gray-500">Invoice Date</div>
                  <div className="font-medium">{new Date(viewInvoice.invoice_date).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500">Status</div>
                  <div className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-[11px] font-medium text-gray-700">
                    {viewInvoice.status}
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden mt-1 bg-white shadow-sm">
                <div className="bg-gradient-to-r from-emerald-50 to-cyan-50 px-3 py-2 text-xs font-semibold text-gray-700 flex items-center justify-between">
                  <span>Invoice Items Preview</span>
                  <span className="inline-flex items-center rounded-full bg-white border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-700">
                    {viewInvoice.items.length} item(s)
                  </span>
                </div>

                {viewInvoice.items.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-gray-500">No items recorded on this invoice.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs sm:text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Item</th>
                          <th className="px-3 py-2 text-left font-semibold">Code</th>
                          <th className="px-3 py-2 text-right font-semibold">Qty</th>
                          <th className="px-3 py-2 text-right font-semibold">Price</th>
                          <th className="px-3 py-2 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {viewInvoice.items.map((item, index) => {
                          const qty = Number(item.quantity) || 0;
                          const unitPrice = Number(item.unit_price) || 0;
                          const lineTotal = qty * unitPrice;

                          return (
                            <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                              <td className="px-3 py-2 font-medium text-gray-800">{item.item_name}</td>
                              <td className="px-3 py-2 text-gray-600">{item.item_code}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{qty.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{unitPrice.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-900">{lineTotal.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {(() => {
                const subtotalVal = typeof viewInvoice.subtotal === 'number'
                  ? Number(viewInvoice.subtotal)
                  : viewInvoice.items.reduce(
                      (sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0),
                      0
                    );

                const notesText = String(viewInvoice.notes || '');
                let rawReturnAmount = 0;
                let deductsFromInvoice = false;
                if (notesText.includes('[ITEM RETURNS]')) {
                  const rawLines = notesText.split('\n');
                  for (const raw of rawLines) {
                    const t = raw.trim();
                    if (t.startsWith('Total return value:')) {
                      const numStr = t.split('Total return value:')[1]?.trim() || '';
                      const parsed = parseFloat(numStr.replace(/[^0-9.\-]/g, ''));
                      if (!Number.isNaN(parsed)) rawReturnAmount = parsed;
                    }
                    if (t.includes('Return mode: DEDUCT FROM INVOICE')) {
                      deductsFromInvoice = true;
                    }
                    if (t.includes('Return mode: EXCHANGE ONLY')) {
                      deductsFromInvoice = false;
                    }
                  }
                }

                const effectiveReturnAmount = deductsFromInvoice ? Math.max(0, rawReturnAmount) : 0;
                const rawDiscount = Number(viewInvoice.discount ?? 0);
                const discountVal = Math.max(0, rawDiscount - effectiveReturnAmount);
                const totalVal = Number(viewInvoice.total ?? Math.max(0, subtotalVal - rawDiscount));

                return (
                  <div className="mt-1 space-y-1 text-xs sm:text-sm">
                    <div className="flex justify-between text-gray-700">
                      <span>Subtotal</span>
                      <span>{subtotalVal.toFixed(2)}</span>
                    </div>
                    {discountVal > 0 && (
                      <div className="flex justify-between text-gray-700">
                        <span>Discount</span>
                        <span>-{discountVal.toFixed(2)}</span>
                      </div>
                    )}
                    {effectiveReturnAmount > 0 && (
                      <div className="flex justify-between text-gray-700">
                        <span>Returns</span>
                        <span>-{effectiveReturnAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-900 font-semibold border-t border-dashed border-gray-200 pt-1 mt-1">
                      <span>Total</span>
                      <span>{totalVal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

              {((viewInvoice.ref_latitude != null && viewInvoice.ref_longitude != null) ||
                (viewInvoice.billing_latitude != null && viewInvoice.billing_longitude != null)) && (
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-3 text-xs text-slate-700 space-y-2">
                  <div className="font-semibold text-cyan-800">GPS Tracking</div>
                  {viewInvoice.ref_latitude != null && viewInvoice.ref_longitude != null && (
                    <div>
                      <span className="font-medium">Ref:</span>{' '}
                      {Number(viewInvoice.ref_latitude).toFixed(6)}, {Number(viewInvoice.ref_longitude).toFixed(6)}
                      {viewInvoice.ref_gps_accuracy != null ? ` (Acc: ${Number(viewInvoice.ref_gps_accuracy).toFixed(1)}m)` : ''}
                    </div>
                  )}
                  {viewInvoice.billing_latitude != null && viewInvoice.billing_longitude != null && (
                    <div>
                      <span className="font-medium">Billing:</span>{' '}
                      {Number(viewInvoice.billing_latitude).toFixed(6)}, {Number(viewInvoice.billing_longitude).toFixed(6)}
                      {viewInvoice.billing_gps_accuracy != null ? ` (Acc: ${Number(viewInvoice.billing_gps_accuracy).toFixed(1)}m)` : ''}
                    </div>
                  )}
                </div>
              )}

              {viewInvoice.notes && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Notes</div>
                  <pre className="text-[11px] sm:text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {viewInvoice.notes}
                  </pre>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="text-[11px] text-gray-500">
                Invoice ID: {viewInvoice.id}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setViewInvoice(null)}
                  className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePosPrint(viewInvoice);
                    setViewInvoice(null);
                  }}
                  className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  POS Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POS 80mm thermal receipt print area */}
      {posPrintInvoice && (
        <div
          ref={posPrintRef}
          className="pos-print-area"
          style={{ position: 'absolute', left: '-9999px', top: 0 }}
        >
          <div
            style={{
              width: '80mm',
              minWidth: '80mm',
              maxWidth: '80mm',
              padding: '4px 6px',
              boxSizing: 'border-box',
              fontFamily: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
              fontSize: '14px',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
              {companyProfileLogoUrl && (
                <div style={{ marginBottom: '5px' }}>
                  <img
                    src={companyProfileLogoUrl}
                    alt="Company logo"
                    style={{
                      width: '42mm',
                      maxWidth: '100%',
                      maxHeight: '28mm',
                      height: 'auto',
                      objectFit: 'contain',
                      objectPosition: 'center',
                      margin: '0 auto',
                      display: 'block',
                    }}
                  />
                </div>
              )}
              <div style={{ fontSize: '14px', fontWeight: 800, lineHeight: 1.25 }}>{companyProfileName}</div>
              {companyProfileAddress && (
                <div style={{ fontSize: '14px', lineHeight: 1.35, marginTop: '2px' }}>{companyProfileAddress}</div>
              )}
              {companyProfilePhone && (
                <div style={{ fontSize: '14px', lineHeight: 1.35 }}>Tel: {companyProfilePhone}</div>
              )}
              {companyProfileEmail && (
                <div style={{ fontSize: '14px', lineHeight: 1.35 }}>{companyProfileEmail}</div>
              )}
              {companyProfileWebsite && (
                <div style={{ fontSize: '14px', lineHeight: 1.35 }}>{companyProfileWebsite}</div>
              )}
            </div>

            <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>

            <div style={{ fontSize: '14px', lineHeight: 1.35 }}>
              <div>Invoice: {posPrintInvoice.invoice_number}</div>
              <div>
                Date:{' '}
                {new Date(posPrintInvoice.invoice_date).toLocaleDateString()}{' '}
                {new Date(posPrintInvoice.invoice_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              {posPrintInvoice.customer && (
                <div>
                  Customer: {posPrintInvoice.customer.shop_name}
                  {posPrintInvoice.customer.customer_code
                    ? ` (${posPrintInvoice.customer.customer_code})`
                    : ''}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>

            <div style={{ fontSize: '14px' }}>
              {posPrintInvoice.items.map((item) => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.unit_price) || 0;
                const lineTotal = qty * price;
                return (
                  <div key={item.id} style={{ marginBottom: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{item.item_name}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>
                        {qty.toFixed(2)} x {price.toFixed(2)}
                      </span>
                      <span>{lineTotal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>

            {(() => {
              const subtotal = Number(
                (posPrintInvoice as any).subtotal ??
                  posPrintInvoice.items.reduce(
                    (sum, it) => sum + Number(it.unit_price) * Number(it.quantity),
                    0
                  )
              );

              const notesText = String((posPrintInvoice as any).notes || '');
              let rawReturnAmount = 0;
              let deductsFromInvoice = false;
              if (notesText.includes('[ITEM RETURNS]')) {
                const rawLines = notesText.split('\n');
                for (const raw of rawLines) {
                  const t = raw.trim();
                  if (t.startsWith('Total return value:')) {
                    const numStr = t.split('Total return value:')[1]?.trim() || '';
                    const parsed = parseFloat(numStr.replace(/[^0-9.\-]/g, ''));
                    if (!Number.isNaN(parsed)) rawReturnAmount = parsed;
                  }
                  if (t.includes('Return mode: DEDUCT FROM INVOICE')) {
                    deductsFromInvoice = true;
                  }
                  if (t.includes('Return mode: EXCHANGE ONLY')) {
                    deductsFromInvoice = false;
                  }
                }
              }

              const effectiveReturnAmount = deductsFromInvoice ? Math.max(0, rawReturnAmount) : 0;
              const rawDiscount = Number((posPrintInvoice as any).discount ?? 0);
              const discount = Math.max(0, rawDiscount - effectiveReturnAmount);
              const total = Number(posPrintInvoice.total ?? Math.max(0, subtotal - rawDiscount));

              return (
                <div style={{ fontSize: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Subtotal</span>
                    <span>{subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Discount</span>
                      <span>-{discount.toFixed(2)}</span>
                    </div>
                  )}
                  {effectiveReturnAmount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Returns</span>
                      <span>-{effectiveReturnAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontWeight: 700 }}>
                    <span>Total</span>
                    <span>{total.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const notes = (posPrintInvoice as any).notes as string | undefined;
              if (!notes || !notes.includes('[ITEM RETURNS]')) return null;

              const rawLines = notes.split('\n');
              const returnedItemsIndex = rawLines.findIndex((l) => l.includes('Returned items:'));
              const summaryLines: string[] = [];
              let totalLine: string | null = null;
              let modeLine: string | null = null;

              if (returnedItemsIndex >= 0) {
                for (let i = returnedItemsIndex + 1; i < rawLines.length; i++) {
                  const t = rawLines[i].trim();
                  if (!t) continue;
                  if (t.startsWith('Total return value:')) {
                    totalLine = t;
                    continue;
                  }
                  if (t.startsWith('Return mode:')) {
                    modeLine = t;
                    continue;
                  }
                  if (!t.startsWith('- ')) break;
                  summaryLines.push(t.replace(/^-\s*/, ''));
                }
              }

              if (summaryLines.length === 0 && !totalLine && !modeLine) return null;

              return (
                <>
                  <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
                  <div style={{ fontSize: '14px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '1px' }}>Returns in this bill</div>
                    {summaryLines.slice(0, 3).map((l, idx) => (
                      <div key={idx}>{l}</div>
                    ))}
                    {totalLine && <div>{totalLine}</div>}
                    {modeLine && <div>{modeLine}</div>}
                  </div>
                </>
              );
            })()}

            {(() => {
              const notes = (posPrintInvoice as any).notes as string | undefined;
              if (!notes || !notes.includes('[PAYMENT EVIDENCE]')) return null;

              const rawLines = notes.split('\n');
              const evidenceStart = rawLines.findIndex((l) => l.includes('[PAYMENT EVIDENCE]'));
              if (evidenceStart < 0) return null;

              const evidenceLines: string[] = [];
              for (let i = evidenceStart + 1; i < rawLines.length; i++) {
                const t = rawLines[i].trim();
                if (!t) continue;
                if (t.startsWith('[') && t.endsWith(']')) break;
                evidenceLines.push(t);
              }

              if (evidenceLines.length === 0) return null;

              return (
                <>
                  <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
                  <div style={{ fontSize: '14px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '1px' }}>Payment Evidence</div>
                    {evidenceLines.map((line, idx) => (
                      <div key={idx}>{line}</div>
                    ))}
                  </div>
                </>
              );
            })()}

            <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }}></div>
            <div style={{ textAlign: 'center', fontSize: '14px', marginTop: '2px' }}>
              Thank you! Come again.
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @page {
          size: 80mm auto;
          margin: 0;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            width: 80mm !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }

          .distribution-invoices-page {
            min-height: auto !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .distribution-invoices-page > * {
            display: none !important;
          }

          .pos-print-area {
            display: block !important;
            position: static !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            min-width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          .pos-print-area * {
            visibility: visible !important;
          }
        }
      `}</style>
    </div>
  );
}
