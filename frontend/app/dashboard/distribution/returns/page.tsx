'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';
import {
  DISTRIBUTION_OFFLINE_KEYS,
  isLikelyNetworkError,
  makeOfflineEntryId,
  readOfflineQueue,
  writeOfflineQueue,
  type OfflineQueueEntry,
} from '@/lib/distributionOffline';

type PendingOfflineReturnPayload = {
  return_number: string;
  customer_id: number;
  distribution_invoice_id: number | null;
  load_id?: number | null;
  return_date: string;
  total_quantity: number;
  total_amount: number;
  settlement_type: 'bill_deduction' | 'item_exchange';
  settlement_amount: number;
  exchange_inventory_item_id: number | null;
  exchange_quantity: number;
  return_lines: Array<{
    inventory_item_id: number;
    item_code: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    amount: number;
    is_damaged: boolean;
  }>;
  reason: string;
  status: string;
  notes: string;
  returned_inventory_item_id: number | null;
};

type InventoryOption = {
  id: number;
  code?: string;
  item_code?: string;
  product_code?: string;
  sku?: string;
  name?: string;
  type?: string;
  item_type?: string;
  category?: string;
  category_name?: string;
  item_category?: string;
  stock_type?: string;
  inventory_type?: string;
  current_stock?: number;
};

type LoadItemInfo = {
  id: number;
  load_id: number;
  product_code: string;
  name?: string;
  qty: number;
  loaded_qty?: number;
  sell_price?: number;
};

type ReturnLineItem = {
  lineId: string;
  inventory_item_id: string;
  item_search: string;
  quantity: string;
  amount: string;
  return_type: 'damage' | 'exchange';
};
type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

const RETURNS_PAGE_CACHE_TTL_MS = 10 * 60 * 1000;

type ReturnsPageCache = {
  savedAt: number;
  returns: any[];
  customers: any[];
  invoices: any[];
  inventory: InventoryOption[];
  allocatedRouteIds: string[] | null;
};

export default function DistributionReturnsPage() {
  const [token, setToken] = useState('');
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isSalesRefUser, setIsSalesRefUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returns, setReturns] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [assignedRouteIds, setAssignedRouteIds] = useState<string[]>([]);
  const [serverAllocatedRouteIds, setServerAllocatedRouteIds] = useState<string[] | null>(null);
  const [customerPickerSearch, setCustomerPickerSearch] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [highlightedCustomerIndex, setHighlightedCustomerIndex] = useState(-1);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [linkedLoadItems, setLinkedLoadItems] = useState<LoadItemInfo[]>([]);
  const [linkedLoadItemsLoading, setLinkedLoadItemsLoading] = useState(false);
  const [viewReturn, setViewReturn] = useState<any | null>(null);
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [pendingOfflineReturns, setPendingOfflineReturns] = useState<OfflineQueueEntry<PendingOfflineReturnPayload>[]>([]);
  const [syncingOfflineReturns, setSyncingOfflineReturns] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [returnLineItems, setReturnLineItems] = useState<ReturnLineItem[]>([
    { lineId: `line-${Date.now()}`, inventory_item_id: '', item_search: '', quantity: '', amount: '', return_type: 'damage' },
  ]);
  const [activeItemPickerLineId, setActiveItemPickerLineId] = useState<string | null>(null);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(-1);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [widgetControlsLocked, setWidgetControlsLocked] = useState(false);
  const [showSuperAdminConfirmModal, setShowSuperAdminConfirmModal] = useState(false);
  const [deletingReturnId, setDeletingReturnId] = useState<number | null>(null);
  const [deleteConfirmReturn, setDeleteConfirmReturn] = useState<any | null>(null);
  const [selectedReturnIds, setSelectedReturnIds] = useState<number[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [superAdminModalMode, setSuperAdminModalMode] = useState<SuperAdminModalMode>('apply');
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<WidgetVisibilityChange[]>([]);
  const [widgetVisibilitySnapshot, setWidgetVisibilitySnapshot] = useState<Record<string, boolean> | null>(null);
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminConfirmLoading, setSuperAdminConfirmLoading] = useState(false);
  const [restoreWidgetListVisible, setRestoreWidgetListVisible] = useState(false);
  const [restoreWidgetLoadingKey, setRestoreWidgetLoadingKey] = useState<string | null>(null);
  const [returnsCurrentPage, setReturnsCurrentPage] = useState(1);
  const returnsPageSize = 10;
  const [returnsFilterSearch, setReturnsFilterSearch] = useState('');
  const [returnsFilterStatus, setReturnsFilterStatus] = useState('all');
  const [returnsFilterCustomerId, setReturnsFilterCustomerId] = useState('all');
  const [returnsFilterDateFrom, setReturnsFilterDateFrom] = useState('');
  const [returnsFilterDateTo, setReturnsFilterDateTo] = useState('');
  const [fallbackActiveLoadId, setFallbackActiveLoadId] = useState<number | null>(null);

  const [form, setForm] = useState({
    return_number: '',
    customer_id: '',
    distribution_invoice_id: '',
    return_date: new Date().toISOString().split('T')[0],
    total_quantity: '',
    total_amount: '',
    reason: '',
    status: 'pending',
    notes: '',
    inventory_item_id: '',
  });
  const customerPickerRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const getReturnsPageCacheKey = (authToken: string) => `distribution_returns_page_cache_${authToken.slice(-16)}`;

  const normalizeRouteIds = (routeIdsRaw: unknown): string[] => {
    if (!Array.isArray(routeIdsRaw)) return [];
    return Array.from(new Set(routeIdsRaw.map((routeId) => String(routeId || '').trim()).filter(Boolean)));
  };

  const resetReturnForm = () => {
    setForm({
      return_number: `RET-${Date.now()}`,
      customer_id: '',
      distribution_invoice_id: '',
      return_date: new Date().toISOString().split('T')[0],
      total_quantity: '',
      total_amount: '',
      reason: '',
      status: 'pending',
      notes: '',
      inventory_item_id: '',
    });
    setReturnLineItems([{ lineId: `line-${Date.now()}`, inventory_item_id: '', item_search: '', quantity: '', amount: '', return_type: 'damage' }]);
    setActiveItemPickerLineId(null);
    setHighlightedItemIndex(-1);
    setCustomerPickerSearch('');
    setShowCustomerPicker(false);
    setHighlightedCustomerIndex(-1);
  };

  const getInventoryCode = (item: InventoryOption) =>
    String(item.code || item.item_code || item.product_code || item.sku || '').trim();

  const getInventoryLabel = (item: InventoryOption) => {
    const code = getInventoryCode(item) || '-';
    const name = String(item.name || '-');
    return `${code} - ${name}`;
  };

  const isRawMaterialInventory = (item: InventoryOption) => {
    const code = getInventoryCode(item).toLowerCase();
    if (code.startsWith('rm-') || code.startsWith('raw-')) return true;
    if (String(item.name || '').trim().toLowerCase().startsWith('rm-')) return true;

    const flags = [
      item.type,
      item.item_type,
      item.category,
      item.category_name,
      item.item_category,
      item.stock_type,
      item.inventory_type,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    return flags.includes('raw_material') || flags.includes('raw material');
  };

  const returnWidgetItems = [
    { id: 'distribution-returns-nav-back-button', name: 'Returns Back Button' },
    { id: 'distribution-returns-offline-status-card', name: 'Returns Offline Status Card' },
    { id: 'distribution-returns-actions-card', name: 'Returns Actions Card' },
    { id: 'distribution-returns-records-card', name: 'Returns Records Card' },
    { id: 'distribution-returns-records-table-headings', name: 'Returns Table Headings' },
    { id: 'distribution-returns-records-row-actions', name: 'Returns Row Actions' },
    { id: 'distribution-returns-create-modal-pane', name: 'Returns Create Modal Pane' },
    { id: 'distribution-returns-create-modal-heading', name: 'Returns Create Modal Heading' },
    { id: 'distribution-returns-create-modal-action-buttons', name: 'Returns Create Modal Action Buttons' },
  ];
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = returnWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

  const fetchWidgetVisibility = async (authToken?: string) => {
    const tokenToUse = authToken || token;
    if (!tokenToUse) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: { Authorization: `Bearer ${tokenToUse}`, Accept: 'application/json' },
      });
      setWidgetVisibility(response.data?.data?.widgets || {});
      setWidgetControlsLocked(Boolean(response.data?.data?.widget_controls_locked));
    } catch {
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    }
  };

  const stageWidgetVisibilityChange = (widgetKey: string, isVisible: boolean) => {
    if (widgetControlsLocked) return;
    setWidgetVisibilitySnapshot((prev) => prev ?? widgetVisibility);
    setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: isVisible }));
    setPendingWidgetChanges((prev) => {
      const remaining = prev.filter((entry) => entry.widget_key !== widgetKey);
      return [...remaining, { widget_key: widgetKey, is_visible: isVisible }];
    });
  };

  const rollbackPendingWidgetChanges = () => {
    if (widgetVisibilitySnapshot) setWidgetVisibility(widgetVisibilitySnapshot);
    setPendingWidgetChanges([]);
    setWidgetVisibilitySnapshot(null);
    setShowSuperAdminConfirmModal(false);
    setSuperAdminModalMode('apply');
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
  };

  const openSuperAdminConfirmation = (changes: WidgetVisibilityChange[] = [], mode: SuperAdminModalMode = 'apply') => {
    if (mode !== 'unlock' && !changes.length) return;
    setSuperAdminModalMode(mode);
    setPendingWidgetChanges(changes);
    setRestoreWidgetListVisible(false);
    setRestoreWidgetLoadingKey(null);
    setSuperAdminEmail('');
    setSuperAdminPassword('');
    setShowSuperAdminConfirmModal(true);
  };

  const applyWidgetVisibilityChanges = async () => {
    if (superAdminModalMode !== 'apply' || !pendingWidgetChanges.length || !token) return;
    if (!superAdminEmail.trim() || !superAdminPassword) return;
    try {
      setSuperAdminConfirmLoading(true);
      for (const change of pendingWidgetChanges) {
        await axios.put('/api/dashboard/widgets/me', {
          widget_key: change.widget_key,
          is_visible: change.is_visible,
          super_admin_email: superAdminEmail.trim(),
          super_admin_password: superAdminPassword,
          lock_widget_controls: true,
        }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      }
      setWidgetControlsLocked(true);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const restoreHiddenWidgetsAfterFix = () => {
    const hiddenKeys = returnWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) return;
    openSuperAdminConfirmation(hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })), 'restore');
  };

  const showRestoreWidgetList = () => {
    if (!superAdminEmail.trim() || !superAdminPassword) return;
    setRestoreWidgetListVisible(true);
  };

  const restoreHiddenWidgetOneByOne = async (widgetKey: string) => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    try {
      setRestoreWidgetLoadingKey(widgetKey);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: widgetKey,
        is_visible: true,
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: true,
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => openSuperAdminConfirmation([], 'unlock');

  const unlockWidgetControls = async () => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    const fallbackWidgetKey = returnWidgetItems[0]?.id || 'distribution-returns-nav-back-button';
    try {
      setSuperAdminConfirmLoading(true);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: fallbackWidgetKey,
        is_visible: isWidgetVisible(fallbackWidgetKey),
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: false,
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetControlsLocked(false);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) router.push('/');
    else setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cachedRouteIdsRaw = window.localStorage.getItem('distribution_assigned_route_ids');
    const cachedRouteId = window.localStorage.getItem('distribution_assigned_route_id');
    const cachedActiveLoad = Number(window.localStorage.getItem('distribution_active_load_id') || 0);
    setFallbackActiveLoadId(cachedActiveLoad > 0 ? cachedActiveLoad : null);

    if (cachedRouteIdsRaw) {
      try {
        const parsed = JSON.parse(cachedRouteIdsRaw);
        const normalized = normalizeRouteIds(parsed);
        if (normalized.length > 0) {
          setAssignedRouteIds(normalized);
          return;
        }
      } catch {
        // Ignore malformed cached route list.
      }
    }

    if (cachedRouteId && String(cachedRouteId).trim()) {
      setAssignedRouteIds([String(cachedRouteId).trim()]);
    }
  }, []);

  const hydrateReturnsPageFromCache = useCallback(() => {
    if (typeof window === 'undefined' || !token) return false;

    try {
      const raw = window.localStorage.getItem(getReturnsPageCacheKey(token));
      if (!raw) return false;

      const parsed = JSON.parse(raw) as ReturnsPageCache | null;
      if (!parsed || !Array.isArray(parsed.returns) || !Array.isArray(parsed.customers) || !Array.isArray(parsed.invoices) || !Array.isArray(parsed.inventory)) {
        return false;
      }

      const age = Date.now() - Number(parsed.savedAt || 0);
      if (age > RETURNS_PAGE_CACHE_TTL_MS) return false;

      setReturns(parsed.returns);
      setCustomers(parsed.customers);
      setInvoices(parsed.invoices);
      setInventory((parsed.inventory as InventoryOption[]).filter((item) => !isRawMaterialInventory(item)));
      setServerAllocatedRouteIds(parsed.allocatedRouteIds);
      setForm((prev) => ({ ...prev, return_number: `RET-${Date.now()}` }));
      setLoading(false);
      return true;
    } catch {
      return false;
    }
  }, [token]);

  const saveReturnsPageToCache = useCallback((payload: Omit<ReturnsPageCache, 'savedAt'>) => {
    if (typeof window === 'undefined' || !token) return;
    try {
      const toSave: ReturnsPageCache = {
        savedAt: Date.now(),
        ...payload,
      };
      window.localStorage.setItem(getReturnsPageCacheKey(token), JSON.stringify(toSave));
    } catch {
      // Cache write failure should never block live data flow.
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      const hydrated = hydrateReturnsPageFromCache();
      void fetchData(hydrated);
      fetchWidgetVisibility(token);
    }
  }, [token, hydrateReturnsPageFromCache]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(window.navigator.onLine);
    setPendingOfflineReturns(readOfflineQueue<PendingOfflineReturnPayload>(DISTRIBUTION_OFFLINE_KEYS.returns));

    const onNetworkChange = () => {
      setIsOnline(window.navigator.onLine);
      setPendingOfflineReturns(readOfflineQueue<PendingOfflineReturnPayload>(DISTRIBUTION_OFFLINE_KEYS.returns));
    };

    window.addEventListener('online', onNetworkChange);
    window.addEventListener('offline', onNetworkChange);

    return () => {
      window.removeEventListener('online', onNetworkChange);
      window.removeEventListener('offline', onNetworkChange);
    };
  }, []);

  useEffect(() => {
    writeOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.returns, pendingOfflineReturns);
  }, [pendingOfflineReturns]);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const [profileRes, returnsRes, customersRes, invoicesRes, inventoryRes] = await Promise.all([
        axios.get('/api/me', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => null),
        axios.get('/api/distribution/returns', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 100 } }),
        axios.get('/api/distribution/customers', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
        axios.get('/api/distribution/invoices', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
        axios.get('/api/stock/inventory', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
      ]);

      const profileRoot = profileRes?.data?.data ?? profileRes?.data ?? {};
      const employeeId = Number((profileRoot as { employee_id?: unknown; employee?: { id?: unknown } })?.employee_id || (profileRoot as { employee?: { id?: unknown } })?.employee?.id || 0);
      const roleNames = [
        String((profileRoot as { role?: unknown })?.role || ''),
        ...(Array.isArray((profileRoot as { roles?: unknown[] })?.roles)
          ? ((profileRoot as { roles?: unknown[] }).roles || []).map((role) => {
              if (typeof role === 'object' && role !== null && 'name' in role) {
                return String((role as { name?: unknown }).name || '');
              }
              return String(role || '');
            })
          : []),
      ]
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean);
      const adminUser = !employeeId || roleNames.includes('super admin') || roleNames.includes('admin');
      const salesRefUser = !adminUser && (roleNames.includes('sales ref') || roleNames.includes('sales representative') || roleNames.includes('sales_ref'));
      setIsAdminUser(adminUser);
      setIsSalesRefUser(salesRefUser);

      const allocatedRouteIds = normalizeRouteIds((profileRoot as { allocated_route_ids?: unknown[] })?.allocated_route_ids);
      setServerAllocatedRouteIds(allocatedRouteIds.length > 0 ? allocatedRouteIds : null);

      const nextReturns = returnsRes.data?.data?.data || [];
      const nextCustomers = customersRes.data?.data?.data || [];
      const nextInvoices = invoicesRes.data?.data?.data || [];
      const inventoryRows = Array.isArray(inventoryRes.data?.data?.data)
        ? inventoryRes.data.data.data
        : Array.isArray(inventoryRes.data?.data)
          ? inventoryRes.data.data
          : [];
      const nextInventory = (inventoryRows as InventoryOption[]).filter((item) => !isRawMaterialInventory(item));

      setReturns(nextReturns);
      setCustomers(nextCustomers);
      setInvoices(nextInvoices);
      setInventory(nextInventory);

      saveReturnsPageToCache({
        returns: nextReturns,
        customers: nextCustomers,
        invoices: nextInvoices,
        inventory: nextInventory,
        allocatedRouteIds: allocatedRouteIds.length > 0 ? allocatedRouteIds : null,
      });

      setForm((prev) => ({ ...prev, return_number: `RET-${Date.now()}` }));
    } catch (error) {
      console.error('Error loading returns data:', error);
      if (!silent) {
        setReturns([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [token, saveReturnsPageToCache]);

  const effectiveAllocatedRouteIds = useMemo(
    () => serverAllocatedRouteIds ?? assignedRouteIds,
    [serverAllocatedRouteIds, assignedRouteIds]
  );

  const scopedCustomers = useMemo(() => {
    if (isAdminUser) return customers;
    if (effectiveAllocatedRouteIds.length === 0) return [];
    const routeIdSet = new Set(effectiveAllocatedRouteIds);
    return customers.filter((customer) => routeIdSet.has(String(customer?.route_id || '')));
  }, [customers, effectiveAllocatedRouteIds, isAdminUser]);

  const selectedCustomer = useMemo(
    () => scopedCustomers.find((customer) => Number(customer?.id) === Number(form.customer_id)) || null,
    [scopedCustomers, form.customer_id]
  );

  const customerSuggestions = useMemo(() => {
    const term = customerPickerSearch.trim().toLowerCase();
    const source = scopedCustomers;
    const filtered = !term
      ? source
      : source.filter((customer) => {
          const shopName = String(customer?.shop_name || '').toLowerCase();
          const code = String(customer?.customer_code || '').toLowerCase();
          return shopName.includes(term) || code.includes(term);
        });
    return filtered.slice(0, 12);
  }, [scopedCustomers, customerPickerSearch]);

  const customerRouteById = useMemo(() => {
    const map = new Map<number, string>();
    customers.forEach((customer) => {
      map.set(Number(customer?.id), String(customer?.route_id || ''));
    });
    return map;
  }, [customers]);

  const invoiceById = useMemo(() => {
    const map = new Map<number, any>();
    invoices.forEach((invoice) => {
      map.set(Number(invoice?.id || 0), invoice);
    });
    return map;
  }, [invoices]);

  const scopedInvoices = useMemo(() => {
    if (isAdminUser) return invoices;
    if (effectiveAllocatedRouteIds.length === 0) return [];
    const routeIdSet = new Set(effectiveAllocatedRouteIds);
    return invoices.filter((invoice) => {
      const routeFromInvoice = String(invoice?.customer?.route_id || customerRouteById.get(Number(invoice?.customer_id)) || '');
      return routeIdSet.has(routeFromInvoice);
    });
  }, [invoices, effectiveAllocatedRouteIds, customerRouteById, isAdminUser]);

  const isSalesRefWithoutAllocatedRoute = !isAdminUser && effectiveAllocatedRouteIds.length === 0;

  const linkedInvoiceOptions = useMemo(() => {
    const selectedCustomerId = Number(form.customer_id || 0);
    const rows = selectedCustomerId
      ? scopedInvoices.filter((invoice) => Number(invoice?.customer_id || 0) === selectedCustomerId)
      : scopedInvoices;
    return [...rows].sort((a, b) => {
      const aDate = new Date(String(a?.invoice_date || 0)).getTime();
      const bDate = new Date(String(b?.invoice_date || 0)).getTime();
      if (aDate !== bDate) return bDate - aDate;
      return Number(b?.id || 0) - Number(a?.id || 0);
    });
  }, [scopedInvoices, form.customer_id]);

  const selectedLinkedInvoice = useMemo(
    () => scopedInvoices.find((invoice) => Number(invoice?.id || 0) === Number(form.distribution_invoice_id || 0)) || null,
    [scopedInvoices, form.distribution_invoice_id]
  );

  const selectedLoadId = Number(selectedLinkedInvoice?.load_id || 0) || null;
  const effectiveReturnLoadId = selectedLoadId ?? fallbackActiveLoadId;

  useEffect(() => {
    const fetchLinkedLoadItems = async () => {
      if (!token || !effectiveReturnLoadId) {
        setLinkedLoadItems([]);
        return;
      }

      try {
        setLinkedLoadItemsLoading(true);
        const res = await axios.get('/api/vehicle-loading/load-items', {
          headers: { Authorization: `Bearer ${token}` },
          params: { load_id: effectiveReturnLoadId },
        });
        const rows = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        const mapped = rows.map((item: any) => ({
          id: Number(item.id),
          load_id: Number(item.load_id),
          product_code: String(item.product_code || ''),
          name: String(item.name || ''),
          qty: Number(item.qty || 0),
          loaded_qty: item.loaded_qty !== undefined && item.loaded_qty !== null ? Number(item.loaded_qty) : undefined,
          sell_price: Number(item.sell_price || 0),
        })) as LoadItemInfo[];
        setLinkedLoadItems(mapped);
      } catch {
        setLinkedLoadItems([]);
      } finally {
        setLinkedLoadItemsLoading(false);
      }
    };

    void fetchLinkedLoadItems();
  }, [token, effectiveReturnLoadId]);

  const linkedLoadItemByCode = useMemo(() => {
    const map = new Map<string, LoadItemInfo>();
    linkedLoadItems.forEach((item) => {
      const code = String(item.product_code || '').trim().toLowerCase();
      if (code) map.set(code, item);
    });
    return map;
  }, [linkedLoadItems]);

  const returnItemOptions = useMemo(
    () => inventory,
    [inventory]
  );

  const getReturnItemSuggestions = useCallback(
    (line: ReturnLineItem) => {
      const term = String(line.item_search || '').trim().toLowerCase();
      const rows = !term
        ? returnItemOptions
        : returnItemOptions.filter((item) => {
            const code = getInventoryCode(item).toLowerCase();
            const name = String(item.name || '').toLowerCase();
            return code.includes(term) || name.includes(term);
          });
      return rows.slice(0, 12);
    },
    [returnItemOptions]
  );

  useEffect(() => {
    setReturnLineItems((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        if (line.item_search) return line;
        const picked = returnItemOptions.find((item) => Number(item.id) === Number(line.inventory_item_id));
        if (!picked) return line;
        changed = true;
        return { ...line, item_search: getInventoryLabel(picked) };
      });
      return changed ? next : prev;
    });
  }, [returnItemOptions]);

  useEffect(() => {
    if (!showCreateModal || !form.customer_id || customerPickerSearch.trim()) return;
    if (!selectedCustomer) return;
    const label = selectedCustomer.customer_code
      ? `${selectedCustomer.shop_name} (${selectedCustomer.customer_code})`
      : String(selectedCustomer.shop_name || '');
    setCustomerPickerSearch(label);
  }, [showCreateModal, form.customer_id, customerPickerSearch, selectedCustomer]);

  useEffect(() => {
    if (!showCreateModal || !showCustomerPicker) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!customerPickerRef.current) return;
      const target = event.target as Node;
      if (!customerPickerRef.current.contains(target)) {
        setShowCustomerPicker(false);
        setHighlightedCustomerIndex(-1);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [showCreateModal, showCustomerPicker]);

  useEffect(() => {
    if (!form.distribution_invoice_id) return;
    const exists = linkedInvoiceOptions.some((invoice) => Number(invoice?.id) === Number(form.distribution_invoice_id));
    if (!exists) {
      setForm((prev) => ({ ...prev, distribution_invoice_id: '' }));
    }
  }, [form.distribution_invoice_id, linkedInvoiceOptions]);

  const returnStatusOptions = useMemo(() => {
    const statuses = Array.from(
      new Set(
        returns
          .map((row) => String(row?.status || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return statuses;
  }, [returns]);

  const filteredReturns = useMemo(() => {
    const searchTerm = returnsFilterSearch.trim().toLowerCase();
    const fromDateTime = returnsFilterDateFrom ? new Date(`${returnsFilterDateFrom}T00:00:00`).getTime() : null;
    const toDateTime = returnsFilterDateTo ? new Date(`${returnsFilterDateTo}T23:59:59`).getTime() : null;
    const activeLoadId = Number(fallbackActiveLoadId || 0);
    const isRestrictedSalesRefView = isSalesRefUser && !isAdminUser;

    return returns.filter((row) => {
      if (isRestrictedSalesRefView) {
        if (activeLoadId <= 0) return false;
        const rowLoadId = Number(row?.load_id || 0);
        const linkedInvoice = row.invoice || invoiceById.get(Number(row.distribution_invoice_id || 0));
        const invoiceLoadId = Number(linkedInvoice?.load_id || 0);
        const belongsToActiveLoad = rowLoadId === activeLoadId || invoiceLoadId === activeLoadId;
        if (!belongsToActiveLoad) return false;
      }

      const status = String(row?.status || '').trim().toLowerCase();
      if (returnsFilterStatus !== 'all' && status !== returnsFilterStatus.toLowerCase()) return false;

      if (returnsFilterCustomerId !== 'all' && Number(row?.customer_id || 0) !== Number(returnsFilterCustomerId || 0)) return false;

      const rowDateTime = row?.return_date ? new Date(String(row.return_date)).getTime() : NaN;
      if (fromDateTime !== null && !Number.isNaN(rowDateTime) && rowDateTime < fromDateTime) return false;
      if (toDateTime !== null && !Number.isNaN(rowDateTime) && rowDateTime > toDateTime) return false;
      if ((fromDateTime !== null || toDateTime !== null) && Number.isNaN(rowDateTime)) return false;

      if (!searchTerm) return true;
      const linkedInvoice = row.invoice || invoiceById.get(Number(row.distribution_invoice_id || 0));
      const haystack = [
        row?.return_number,
        row?.customer?.shop_name,
        row?.customer?.customer_code,
        linkedInvoice?.invoice_number,
        row?.reason,
        row?.notes,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return haystack.includes(searchTerm);
    });
  }, [returns, invoiceById, returnsFilterSearch, returnsFilterStatus, returnsFilterCustomerId, returnsFilterDateFrom, returnsFilterDateTo, fallbackActiveLoadId, isSalesRefUser, isAdminUser]);

  const returnsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredReturns.length / returnsPageSize)),
    [filteredReturns.length]
  );

  const pagedReturns = useMemo(() => {
    const start = (returnsCurrentPage - 1) * returnsPageSize;
    return filteredReturns.slice(start, start + returnsPageSize);
  }, [filteredReturns, returnsCurrentPage]);

  useEffect(() => {
    setReturnsCurrentPage(1);
  }, [returns.length, returnsFilterSearch, returnsFilterStatus, returnsFilterCustomerId, returnsFilterDateFrom, returnsFilterDateTo]);

  const syncOfflineReturns = useCallback(async () => {
    if (!token || syncingOfflineReturns || pendingOfflineReturns.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    setSyncingOfflineReturns(true);
    try {
      const stillPending: OfflineQueueEntry<PendingOfflineReturnPayload>[] = [];
      let syncedAny = false;

      for (const entry of pendingOfflineReturns) {
        try {
          await axios.post('/api/distribution/returns', entry.payload, {
            headers: { Authorization: `Bearer ${token}` },
          });
          syncedAny = true;
        } catch (error) {
          if (isLikelyNetworkError(error)) {
            stillPending.push(entry);
            continue;
          }

          console.error('Failed to sync offline return entry, keeping in queue:', error);
          stillPending.push(entry);
        }
      }

      if (syncedAny) {
        setPendingOfflineReturns(stillPending);
        await fetchData();
      }
    } finally {
      setSyncingOfflineReturns(false);
    }
  }, [token, syncingOfflineReturns, pendingOfflineReturns, fetchData]);

  useEffect(() => {
    if (!token) return;

    const handleOnline = () => {
      syncOfflineReturns();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    syncOfflineReturns();

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [token, pendingOfflineReturns.length, syncOfflineReturns]);

  const createReturn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.customer_id) {
      alert('Please select a customer.');
      return;
    }

    if (effectiveAllocatedRouteIds.length > 0) {
      const isScopedCustomer = scopedCustomers.some((customer) => Number(customer?.id) === Number(form.customer_id));
      if (!isScopedCustomer) {
        alert('Selected customer is not in your allocated route.');
        return;
      }
    }

    const validLineItems = returnLineItems.filter((line) => {
      const qty = Number(line.quantity || 0);
      const amount = Number(line.amount || 0);
      return Boolean(line.inventory_item_id) && qty > 0 && amount >= 0;
    });

    if (validLineItems.length === 0) {
      alert('Please add at least one return item with quantity and amount.');
      return;
    }

    const computedQuantity = validLineItems.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const computedAmount = validLineItems.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const firstReturnedItemId = Number(validLineItems[0].inventory_item_id);

    const normalizedLineItems = validLineItems.map((line) => {
      const selectedItem = inventory.find((item) => Number(item.id) === Number(line.inventory_item_id));
      const quantity = Number(line.quantity || 0);
      const amount = Number(line.amount || 0);
      const unitPrice = quantity > 0 ? amount / quantity : 0;
      return {
        inventory_item_id: Number(line.inventory_item_id),
        item_code: selectedItem ? getInventoryCode(selectedItem) : '',
        item_name: selectedItem?.name || '',
        quantity,
        amount,
        unit_price: unitPrice,
        is_damaged: line.return_type === 'damage',
      };
    });

    const hasExchangeLines = normalizedLineItems.some((line) => !line.is_damaged);
    const hasDamageLines = normalizedLineItems.some((line) => line.is_damaged);
    const exchangeQuantity = normalizedLineItems
      .filter((line) => !line.is_damaged)
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const damageAmount = normalizedLineItems
      .filter((line) => line.is_damaged)
      .reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const settlementType: 'bill_deduction' | 'item_exchange' = hasExchangeLines && !hasDamageLines
      ? 'item_exchange'
      : 'bill_deduction';

    const multiItemSection = [
      '[RETURN ITEMS]',
      ...normalizedLineItems.map(
        (line, index) =>
          `${index + 1}. ${line.item_code || '-'} ${line.item_name || '-'} | Qty: ${line.quantity.toFixed(2)} | Amount: ${line.amount.toFixed(2)}`
      ),
      '[/RETURN ITEMS]',
    ].join('\n');

    const itemReturnsSection = [
      '[ITEM RETURNS]',
      ...normalizedLineItems.map(
        (line) => `- ${line.quantity.toFixed(2)} x ${line.item_name || line.item_code || '-'} (${line.item_code || '-'}) @ ${line.unit_price.toFixed(2)} => amount ${line.amount.toFixed(2)}${line.is_damaged ? ' [DAMAGED]' : ' [EXCHANGE]'}`
      ),
      '[/ITEM RETURNS]',
    ].join('\n');

    const returnTypeSection = [
      '[RETURN TYPE]',
      hasDamageLines && hasExchangeLines ? 'Mixed Return (Damage + Exchange)' : hasExchangeLines ? 'Exchange Return' : 'Damage Return',
      '[/RETURN TYPE]',
    ].join('\n');

    const mergedNotes = [form.notes?.trim(), returnTypeSection, multiItemSection, itemReturnsSection].filter(Boolean).join('\n\n');

    const payload: PendingOfflineReturnPayload = {
      return_number: form.return_number,
      customer_id: Number(form.customer_id),
      distribution_invoice_id: form.distribution_invoice_id ? Number(form.distribution_invoice_id) : null,
      load_id: effectiveReturnLoadId,
      returned_inventory_item_id: firstReturnedItemId,
      return_date: form.return_date,
      total_quantity: computedQuantity,
      total_amount: computedAmount,
      settlement_type: settlementType,
      settlement_amount: hasDamageLines ? damageAmount : 0,
      exchange_inventory_item_id: null,
      exchange_quantity: exchangeQuantity,
      return_lines: normalizedLineItems,
      reason: form.reason.trim() || (hasDamageLines && hasExchangeLines ? 'mixed_return' : hasExchangeLines ? 'item_exchange' : 'damaged_items'),
      status: form.status,
      notes: mergedNotes,
    };

    const queueReturnOffline = () => {
      const entry: OfflineQueueEntry<PendingOfflineReturnPayload> = {
        id: makeOfflineEntryId('dist-return'),
        createdAt: new Date().toISOString(),
        payload,
      };

      setPendingOfflineReturns((previous) => [...previous, entry]);
      resetReturnForm();
      alert('No internet connection. Return saved offline and will sync automatically when connection is restored.');
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      queueReturnOffline();
      return;
    }

    try {
      setSaving(true);
      await axios.post('/api/distribution/returns', payload, { headers: { Authorization: `Bearer ${token}` } });

      resetReturnForm();
      setShowCreateModal(false);
      fetchData();
    } catch (error: any) {
      if (isLikelyNetworkError(error)) {
        queueReturnOffline();
        return;
      }
      alert(error?.response?.data?.message || 'Failed to record return');
    } finally {
      setSaving(false);
    }
  };

  const deleteReturn = async () => {
    const returnId = Number(deleteConfirmReturn?.id || 0);
    if (!returnId || !token) return;

    try {
      setDeletingReturnId(returnId);
      await axios.delete(`/api/distribution/returns/${returnId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchData();
      setSelectedReturnIds((prev) => prev.filter((id) => id !== returnId));
      setDeleteConfirmReturn(null);
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to delete return');
    } finally {
      setDeletingReturnId(null);
    }
  };

  const toggleReturnSelection = (id: number) => {
    setSelectedReturnIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleSelectAllOnPage = () => {
    const pageIds = pagedReturns.map((row) => Number(row.id)).filter((id) => id > 0);
    if (pageIds.length === 0) return;

    const allSelected = pageIds.every((id) => selectedReturnIds.includes(id));
    setSelectedReturnIds((prev) => {
      if (allSelected) {
        return prev.filter((id) => !pageIds.includes(id));
      }
      const next = new Set(prev);
      pageIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const deleteSelectedReturns = async () => {
    if (!token || selectedReturnIds.length === 0) return;

    try {
      setBulkDeleting(true);
      for (const id of selectedReturnIds) {
        await axios.delete(`/api/distribution/returns/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      setShowBulkDeleteConfirm(false);
      setSelectedReturnIds([]);
      await fetchData();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to delete selected returns');
    } finally {
      setBulkDeleting(false);
    }
  };

  useEffect(() => {
    const validIds = new Set(returns.map((row) => Number(row?.id || 0)).filter((id) => id > 0));
    setSelectedReturnIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [returns]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 h-auto">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-r from-green-500 to-teal-500 rounded-lg flex items-center justify-center text-white text-lg">
                  ↩️
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-semibold text-gray-900">Distribution Returns</h1>
                  <p className="text-xs text-gray-500">Record and review returned items.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-start sm:justify-end">
              {isWidgetVisible('distribution-returns-nav-back-button') && <Link
                href="/dashboard/distribution"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to Distribution
              </Link>}
            </div>
          </div>
        </div>
      </nav>

      {!loading && isSalesRefWithoutAllocatedRoute ? (
        <main className="w-full py-8 px-3 sm:px-4 lg:px-6">
          <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <h2 className="text-base font-semibold">Returns Hidden For Security</h2>
            <p className="mt-1">
              No allocated route was found for this sales ref account, so returns access is blocked. Please contact admin to assign a route.
            </p>
          </section>
        </main>
      ) : (

      <main className="w-full py-8 px-3 sm:px-4 lg:px-6 space-y-6">

        {isWidgetVisible('distribution-returns-offline-status-card') && <section className={`rounded-xl border px-4 py-3 ${isOnline ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
            <p className={isOnline ? 'text-emerald-800' : 'text-amber-800'}>
              {isOnline ? 'Online mode: returns sync directly to server.' : 'Offline mode: new returns are saved locally.'}
            </p>
            <div className="flex items-center gap-2"><p className="text-xs font-semibold text-gray-700">
              Pending offline returns: {pendingOfflineReturns.length}
              {syncingOfflineReturns ? ' (syncing...)' : ''}
            </p></div>
          </div>
        </section>}

        {isWidgetVisible('distribution-returns-actions-card') && <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Return actions</h2>
              <p className="text-xs text-gray-500">Click Add Return to open the return-entry modal.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetReturnForm();
                setShowCreateModal(true);
              }}
              className="w-full sm:w-auto rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              Add Return
            </button>
          </div>
        </section>}

        {isWidgetVisible('distribution-returns-records-card') && <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Return records</h2>
              <p className="text-xs text-gray-500">Browse all distribution returns.</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedReturnIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  Delete Selected ({selectedReturnIds.length})
                </button>
              )}
            </div>
          </div>
          <div className="border-b border-gray-100 px-4 py-3 sm:px-6">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
              <input
                type="text"
                value={returnsFilterSearch}
                onChange={(e) => setReturnsFilterSearch(e.target.value)}
                placeholder="Search return/customer/invoice"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
              <select
                value={returnsFilterStatus}
                onChange={(e) => setReturnsFilterStatus(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                <option value="all">All status</option>
                {returnStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <select
                value={returnsFilterCustomerId}
                onChange={(e) => setReturnsFilterCustomerId(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                <option value="all">All customers</option>
                {scopedCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.shop_name}
                    {customer.customer_code ? ` (${customer.customer_code})` : ''}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={returnsFilterDateFrom}
                onChange={(e) => setReturnsFilterDateFrom(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={returnsFilterDateTo}
                  onChange={(e) => setReturnsFilterDateTo(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    setReturnsFilterSearch('');
                    setReturnsFilterStatus('all');
                    setReturnsFilterCustomerId('all');
                    setReturnsFilterDateFrom('');
                    setReturnsFilterDateTo('');
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              {isWidgetVisible('distribution-returns-records-table-headings') && <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">
                    <input
                      type="checkbox"
                      checked={pagedReturns.length > 0 && pagedReturns.every((row) => selectedReturnIds.includes(Number(row.id)))}
                      onChange={toggleSelectAllOnPage}
                      className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Return</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>}
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading...</td>
                  </tr>
                ) : filteredReturns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No returns match the filters.</td>
                  </tr>
                ) : (
                  pagedReturns.map((row) => {
                    const linkedInvoice = row.invoice || invoices.find((inv) => Number(inv.id) === Number(row.distribution_invoice_id));
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedReturnIds.includes(Number(row.id))}
                            onChange={() => toggleReturnSelection(Number(row.id))}
                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.return_number}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.customer?.shop_name || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {linkedInvoice ? (
                            <button
                              type="button"
                              onClick={() => setViewInvoice(linkedInvoice)}
                              className="text-xs text-green-700 hover:text-green-800 hover:underline"
                            >
                              {linkedInvoice.invoice_number}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">{new Date(row.return_date).toLocaleDateString()}</td>
                        <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(row.total_quantity).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(row.total_amount).toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.status}</td>
                        <td className="px-4 py-2 text-sm text-gray-700 text-right">
                          {isWidgetVisible('distribution-returns-records-row-actions') && (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setViewReturn(row)}
                                className="px-3 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmReturn(row)}
                                disabled={deletingReturnId === Number(row.id)}
                                className="px-3 py-1 text-xs rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deletingReturnId === Number(row.id) ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!loading && filteredReturns.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-600 sm:px-6">
              <p>
                Showing {(returnsCurrentPage - 1) * returnsPageSize + 1}
                {' '}-{' '}
                {Math.min(returnsCurrentPage * returnsPageSize, filteredReturns.length)}
                {' '}of{' '}
                {filteredReturns.length} returns
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReturnsCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={returnsCurrentPage <= 1}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-[11px] text-gray-500">
                  Page {returnsCurrentPage} of {returnsTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setReturnsCurrentPage((prev) => Math.min(returnsTotalPages, prev + 1))}
                  disabled={returnsCurrentPage >= returnsTotalPages}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>}
      </main>
      )}

      {isWidgetVisible('distribution-returns-create-modal-pane') && showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-3">
          <div className="h-[100dvh] w-full overflow-y-auto rounded-none border-0 bg-white shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-slate-200">
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
              {isWidgetVisible('distribution-returns-create-modal-heading') && <div>
                <h3 className="text-lg font-semibold text-slate-900">Add Return</h3>
                <p className="text-xs text-slate-600">Link a return to a customer, choose return type, and add one or more items.</p>
              </div>}
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] sm:text-[11px]">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                  Type: {returnLineItems.some((line) => line.return_type === 'damage') && returnLineItems.some((line) => line.return_type === 'exchange')
                    ? 'Mixed'
                    : returnLineItems.some((line) => line.return_type === 'exchange')
                      ? 'Exchange'
                      : 'Damage'}
                </span>
                <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-semibold text-cyan-700">
                  Items: {returnLineItems.length}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700">
                  Qty: {returnLineItems.reduce((sum, line) => sum + Number(line.quantity || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>

            <form onSubmit={createReturn} className="space-y-4 p-3 sm:p-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-slate-900">Return Header</h4>
                  <p className="text-xs text-slate-500">Basic return details and customer linkage.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Return Number</label>
                  <input
                    value={form.return_number}
                    onChange={(e) => setForm({ ...form, return_number: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Customer</label>
                  <div ref={customerPickerRef} className="relative">
                    <input
                      type="text"
                      value={customerPickerSearch}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCustomerPickerSearch(value);
                        setForm((prev) => ({ ...prev, customer_id: '', distribution_invoice_id: '' }));
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
                          setShowCustomerPicker(true);
                          setHighlightedCustomerIndex((prev) => {
                            const next = prev + 1;
                            return next >= customerSuggestions.length ? 0 : next;
                          });
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setShowCustomerPicker(true);
                          setHighlightedCustomerIndex((prev) => {
                            const next = prev - 1;
                            return next < 0 ? customerSuggestions.length - 1 : next;
                          });
                        } else if (e.key === 'Enter') {
                          if (showCustomerPicker && customerSuggestions.length > 0) {
                            e.preventDefault();
                            const pickedIndex = highlightedCustomerIndex >= 0 ? highlightedCustomerIndex : 0;
                            const picked = customerSuggestions[pickedIndex];
                            if (picked) {
                              const label = picked.customer_code
                                ? `${picked.shop_name} (${picked.customer_code})`
                                : String(picked.shop_name || '');
                              setForm((prev) => ({ ...prev, customer_id: String(picked.id), distribution_invoice_id: '' }));
                              setCustomerPickerSearch(label);
                              setShowCustomerPicker(false);
                              setHighlightedCustomerIndex(-1);
                            }
                          }
                        } else if (e.key === 'Escape') {
                          setShowCustomerPicker(false);
                          setHighlightedCustomerIndex(-1);
                        }
                      }}
                      placeholder="Type customer name or code"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                      required
                    />
                    <input type="hidden" value={form.customer_id} required />

                    {showCustomerPicker && customerSuggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                        {customerSuggestions.map((customer, index) => {
                          const isHighlighted = index === highlightedCustomerIndex;
                          return (
                            <button
                              key={customer.id}
                              type="button"
                              onMouseEnter={() => setHighlightedCustomerIndex(index)}
                              onClick={() => {
                                const label = customer.customer_code
                                  ? `${customer.shop_name} (${customer.customer_code})`
                                  : String(customer.shop_name || '');
                                setForm((prev) => ({ ...prev, customer_id: String(customer.id), distribution_invoice_id: '' }));
                                setCustomerPickerSearch(label);
                                setShowCustomerPicker(false);
                                setHighlightedCustomerIndex(-1);
                              }}
                              className={`block w-full px-3 py-2 text-left text-sm ${isHighlighted ? 'bg-emerald-50 text-emerald-900' : 'text-gray-800 hover:bg-gray-50'}`}
                            >
                              <span className="font-medium">{customer.shop_name}</span>
                              {customer.customer_code && <span className="ml-1 text-xs text-gray-500">({customer.customer_code})</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {showCustomerPicker && customerSuggestions.length === 0 && customerPickerSearch.trim() && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
                        No customers found in your allocated routes.
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Linked Invoice (optional)</label>
                  <select
                    value={form.distribution_invoice_id}
                    onChange={(e) => setForm({ ...form, distribution_invoice_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="">Select Invoice</option>
                    {linkedInvoiceOptions.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>{invoice.invoice_number}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {effectiveReturnLoadId
                      ? linkedLoadItemsLoading
                        ? 'Loading allocated load details...'
                        : `${selectedLoadId ? 'Allocated' : 'Active'} Load #${effectiveReturnLoadId} loaded for availability preview. Item search includes all finished products.`
                      : `Item search includes all finished products (${returnItemOptions.length}).`}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Return Date</label>
                  <input
                    type="date"
                    value={form.return_date}
                    onChange={(e) => setForm({ ...form, return_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                    required
                  />
                </div>
              </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="mb-3 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Return Items</h4>
                    <p className="text-xs text-slate-500">Add one or more items to this return bill.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setReturnLineItems((prev) => [
                        ...prev,
                        { lineId: `line-${Date.now()}-${prev.length}`, inventory_item_id: '', item_search: '', quantity: '', amount: '', return_type: 'damage' },
                      ])
                    }
                    className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="space-y-2.5">
                  {returnLineItems.map((line, index) => (
                    <div key={line.lineId} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 md:grid-cols-12 md:items-end">
                      <div className="md:col-span-5">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-100 text-[10px] font-bold text-cyan-700">{index + 1}</span>
                          <label className="block text-xs font-medium text-slate-700">Item</label>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={line.item_search}
                            onChange={(e) => {
                              const value = e.target.value;
                              setReturnLineItems((prev) =>
                                prev.map((row) =>
                                  row.lineId === line.lineId
                                    ? { ...row, item_search: value, inventory_item_id: '' }
                                    : row
                                )
                              );
                              setActiveItemPickerLineId(line.lineId);
                              setHighlightedItemIndex(-1);
                            }}
                            onFocus={() => {
                              setActiveItemPickerLineId(line.lineId);
                              setHighlightedItemIndex(-1);
                            }}
                            onBlur={() => {
                              window.setTimeout(() => {
                                setActiveItemPickerLineId((prev) => (prev === line.lineId ? null : prev));
                                setHighlightedItemIndex(-1);
                              }, 120);
                            }}
                            onKeyDown={(e) => {
                              const suggestions = getReturnItemSuggestions(line);
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setActiveItemPickerLineId(line.lineId);
                                setHighlightedItemIndex((prev) => {
                                  const next = prev + 1;
                                  return next >= suggestions.length ? 0 : next;
                                });
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setActiveItemPickerLineId(line.lineId);
                                setHighlightedItemIndex((prev) => {
                                  const next = prev - 1;
                                  return next < 0 ? suggestions.length - 1 : next;
                                });
                              } else if (e.key === 'Enter') {
                                if (activeItemPickerLineId === line.lineId && suggestions.length > 0) {
                                  e.preventDefault();
                                  const pickedIndex = highlightedItemIndex >= 0 ? highlightedItemIndex : 0;
                                  const picked = suggestions[pickedIndex];
                                  if (picked) {
                                    setReturnLineItems((prev) =>
                                      prev.map((row) =>
                                        row.lineId === line.lineId
                                          ? {
                                              ...row,
                                              inventory_item_id: String(picked.id),
                                              item_search: getInventoryLabel(picked),
                                            }
                                          : row
                                      )
                                    );
                                    setActiveItemPickerLineId(null);
                                    setHighlightedItemIndex(-1);
                                  }
                                }
                              } else if (e.key === 'Escape') {
                                setActiveItemPickerLineId(null);
                                setHighlightedItemIndex(-1);
                              }
                            }}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                            placeholder="Select Item"
                            required={index === 0}
                          />
                          <input type="hidden" value={line.inventory_item_id} required={index === 0} />

                          {activeItemPickerLineId === line.lineId && getReturnItemSuggestions(line).length > 0 && (
                            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                              {getReturnItemSuggestions(line).map((item, suggestionIndex) => {
                                const isHighlighted = highlightedItemIndex === suggestionIndex;
                                return (
                                  <button
                                    key={`${line.lineId}-${item.id}`}
                                    type="button"
                                    onMouseEnter={() => setHighlightedItemIndex(suggestionIndex)}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setReturnLineItems((prev) =>
                                        prev.map((row) =>
                                          row.lineId === line.lineId
                                            ? {
                                                ...row,
                                                inventory_item_id: String(item.id),
                                                item_search: getInventoryLabel(item),
                                              }
                                            : row
                                        )
                                      );
                                      setActiveItemPickerLineId(null);
                                      setHighlightedItemIndex(-1);
                                    }}
                                    className={`block w-full px-3 py-2 text-left text-sm ${isHighlighted ? 'bg-emerald-50 text-emerald-900' : 'text-gray-800 hover:bg-gray-50'}`}
                                  >
                                    <div className="font-medium">{getInventoryLabel(item)}</div>
                                    {(() => {
                                      const loadEntry = linkedLoadItemByCode.get(getInventoryCode(item).toLowerCase());
                                      if (!loadEntry) return null;
                                      return (
                                        <div className="mt-0.5 text-[11px] text-slate-500">
                                          Load Available: {Number(loadEntry.qty || 0).toFixed(2)}
                                        </div>
                                      );
                                    })()}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {activeItemPickerLineId === line.lineId && getReturnItemSuggestions(line).length === 0 && line.item_search.trim() && (
                            <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
                              No items found.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">Qty</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) =>
                            setReturnLineItems((prev) =>
                              prev.map((row) => (row.lineId === line.lineId ? { ...row, quantity: e.target.value } : row))
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                          placeholder="0.00"
                          required={index === 0}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">Amount</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.amount}
                          onChange={(e) =>
                            setReturnLineItems((prev) =>
                              prev.map((row) => (row.lineId === line.lineId ? { ...row, amount: e.target.value } : row))
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                          placeholder="0.00"
                          required={index === 0}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-1 block text-xs font-medium text-slate-700">Return Type</label>
                        <select
                          value={line.return_type}
                          onChange={(e) =>
                            setReturnLineItems((prev) =>
                              prev.map((row) =>
                                row.lineId === line.lineId
                                  ? { ...row, return_type: e.target.value as 'damage' | 'exchange' }
                                  : row
                              )
                            )
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                        >
                          <option value="damage">Damage</option>
                          <option value="exchange">Exchange</option>
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() =>
                            setReturnLineItems((prev) =>
                              prev.length > 1 ? prev.filter((row) => row.lineId !== line.lineId) : prev
                            )
                          }
                          disabled={returnLineItems.length === 1}
                          className="w-full rounded-xl border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Total Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={returnLineItems.reduce((sum, line) => sum + Number(line.quantity || 0), 0).toFixed(2)}
                    className="w-full rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800 px-3 py-2"
                    readOnly
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Total Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={returnLineItems.reduce((sum, line) => sum + Number(line.amount || 0), 0).toFixed(2)}
                    className="w-full rounded-xl border border-cyan-200 bg-cyan-50 text-sm font-semibold text-cyan-800 px-3 py-2"
                    readOnly
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 items-end gap-3 sm:gap-4 md:grid-cols-3">
                <div className="md:col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Reason</label>
                  <input
                    value={form.reason}
                    onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Reason for return"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="mb-1 block text-xs font-medium text-slate-700">Notes</label>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Additional details"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
                {isWidgetVisible('distribution-returns-create-modal-action-buttons') && <div className="md:col-span-1 flex flex-col-reverse justify-end gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 sm:w-auto"
                  >
                    {saving ? 'Saving...' : 'Record Return'}
                  </button>
                </div>}
              </div>
            </form>
          </div>
        </div>
      )}

      {viewReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-11/12 md:w-[640px] max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
            <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Return {viewReturn.return_number}</h3>
                <p className="text-xs text-gray-500">
                  {viewReturn.customer?.shop_name || 'Unknown customer'}
                  {viewReturn.customer?.customer_code ? ` (${viewReturn.customer.customer_code})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewReturn(null)}
                className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm text-gray-700">
              <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                <div>
                  <div className="text-gray-500">Return Date</div>
                  <div className="font-medium">{new Date(viewReturn.return_date).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500">Status</div>
                  <div className="inline-flex px-2 py-0.5 rounded-full bg-gray-100 text-[11px] font-medium text-gray-700">
                    {viewReturn.status}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm mt-1">
                <div>
                  <div className="text-gray-500">Linked Invoice</div>
                  <div className="font-medium">{viewReturn.invoice?.invoice_number || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="text-gray-500">Total Qty / Amount</div>
                  <div className="font-medium">
                    {Number(viewReturn.total_quantity || 0).toFixed(2)} / {Number(viewReturn.total_amount || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {(() => {
                const returned = (viewReturn as any).returned_item || (viewReturn as any).returnedItem;
                const exchange = (viewReturn as any).exchange_item || (viewReturn as any).exchangeItem;
                const settlementType: string | undefined = viewReturn.settlement_type;
                const settlementAmount = Number(viewReturn.settlement_amount || 0);
                const exchangeQty = Number(viewReturn.exchange_quantity || 0);
                const noteText = String(viewReturn.notes || '');

                const settlementLabel = settlementType === 'bill_deduction'
                  ? 'Deduct bill amount'
                  : settlementType === 'cash_refund'
                  ? 'Return cash'
                  : settlementType === 'item_exchange'
                  ? 'Item exchange'
                  : settlementType || 'Not specified';

                const parsedReturnedItems: Array<{ item: string; qty?: string; amount?: string }> = [];
                const noteLines = noteText.split('\n');

                const returnItemsStart = noteLines.findIndex((line) => line.trim() === '[RETURN ITEMS]');
                const returnItemsEnd = noteLines.findIndex((line) => line.trim() === '[/RETURN ITEMS]');
                if (returnItemsStart >= 0 && returnItemsEnd > returnItemsStart) {
                  noteLines.slice(returnItemsStart + 1, returnItemsEnd).forEach((line) => {
                    const text = line.trim();
                    if (!text) return;

                    const cleaned = text.replace(/^\d+\.\s*/, '');
                    const parts = cleaned.split('|').map((part) => part.trim());
                    const itemLabel = parts[0] || cleaned;
                    const qty = parts.find((part) => part.toLowerCase().startsWith('qty:'))?.split(':')[1]?.trim();
                    const amount = parts.find((part) => part.toLowerCase().startsWith('amount:'))?.split(':')[1]?.trim();

                    parsedReturnedItems.push({ item: itemLabel, qty, amount });
                  });
                }

                if (parsedReturnedItems.length === 0) {
                  const itemReturnsStart = noteLines.findIndex((line) => line.trim() === '[ITEM RETURNS]');
                  if (itemReturnsStart >= 0) {
                    for (let i = itemReturnsStart + 1; i < noteLines.length; i += 1) {
                      const text = noteLines[i].trim();
                      if (!text || text.startsWith('[')) break;
                      if (!text.startsWith('-')) continue;

                      const cleaned = text.replace(/^-\s*/, '');
                      parsedReturnedItems.push({ item: cleaned });
                    }
                  }
                }

                const hasParsedReturnItems = parsedReturnedItems.length > 0;

                return (
                  <div className="space-y-3 mt-2">
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">Returned Item{hasParsedReturnItems ? 's' : ''}</div>
                      <div className="px-3 py-2 text-xs sm:text-sm">
                        {hasParsedReturnItems ? (
                          <div className="space-y-2">
                            {parsedReturnedItems.map((entry, idx) => (
                              <div key={`returned-item-${idx}`} className="rounded-md border border-gray-100 bg-gray-50/40 px-2 py-1.5">
                                <div className="font-medium text-gray-800">{entry.item}</div>
                                {(entry.qty || entry.amount) && (
                                  <div className="mt-0.5 text-[11px] text-gray-600">
                                    {entry.qty ? `Qty: ${entry.qty}` : ''}
                                    {entry.qty && entry.amount ? ' | ' : ''}
                                    {entry.amount ? `Amount: ${entry.amount}` : ''}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : returned ? (
                          <>
                            <div className="flex justify-between">
                              <div className="font-medium text-gray-800">{returned.name}</div>
                              <div className="text-gray-500">{returned.code}</div>
                            </div>
                            <div className="mt-0.5 text-gray-600 text-xs">
                              Unit: {returned.unit || '—'} | Qty: {Number(viewReturn.total_quantity || 0).toFixed(2)}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-gray-500">Not linked to a specific inventory item.</div>
                        )}
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">Settlement</div>
                      <div className="px-3 py-2 text-xs sm:text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Type</span>
                          <span className="font-medium text-gray-900">{settlementLabel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Amount</span>
                          <span className="font-medium text-gray-900">{settlementAmount.toFixed(2)}</span>
                        </div>
                        {exchange && (
                          <div className="pt-1 mt-1 border-t border-dashed border-gray-200">
                            <div className="text-[11px] text-gray-500 mb-0.5">Exchange Item</div>
                            <div className="flex justify-between text-xs">
                              <span>
                                {exchange.code} - {exchange.name}
                              </span>
                              <span className="font-medium">Qty: {exchangeQty.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(viewReturn.reason || viewReturn.notes) && (
                <div className="mt-2 space-y-1">
                  {viewReturn.reason && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-0.5">Reason</div>
                      <div className="text-xs sm:text-sm text-gray-700">{viewReturn.reason}</div>
                    </div>
                  )}
                  {viewReturn.notes && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-0.5">Notes</div>
                      <pre className="text-[11px] sm:text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md p-2 whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {viewReturn.notes}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="text-[11px] text-gray-500">Return ID: {viewReturn.id}</div>
              <button
                type="button"
                onClick={() => setViewReturn(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmReturn && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">Delete Return</h3>
            <p className="mt-2 text-sm text-gray-600">
              Delete return <span className="font-semibold text-gray-900">{deleteConfirmReturn.return_number || `#${deleteConfirmReturn.id}`}</span>?
              This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmReturn(null)}
                disabled={deletingReturnId === Number(deleteConfirmReturn.id)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteReturn}
                disabled={deletingReturnId === Number(deleteConfirmReturn.id)}
                className="rounded-md border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingReturnId === Number(deleteConfirmReturn.id) ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-900">Delete Selected Returns</h3>
            <p className="mt-2 text-sm text-gray-600">
              Delete <span className="font-semibold text-gray-900">{selectedReturnIds.length}</span> selected return record(s)?
              This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteSelectedReturns}
                disabled={bulkDeleting}
                className="rounded-md border border-red-300 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}
      {viewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-11/12 md:w-[640px] max-h-[90vh] overflow-hidden flex flex-col border border-gray-200">
            <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
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

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm text-gray-700">
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

              <div className="border border-gray-200 rounded-lg overflow-hidden mt-1">
                <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">Items</div>
                <div className="divide-y divide-gray-100">
                  {(Array.isArray(viewInvoice.items) ? viewInvoice.items : []).map((item: any) => {
                    const qty = Number(item.quantity) || 0;
                    const unitPrice = Number(item.unit_price) || 0;
                    const lineTotal = qty * unitPrice;
                    return (
                      <div key={item.id} className="px-3 py-2 text-xs sm:text-sm">
                        <div className="flex justify-between">
                          <div className="font-medium text-gray-800">{item.item_name}</div>
                          <div className="text-gray-500">{item.item_code}</div>
                        </div>
                        <div className="mt-0.5 flex justify-between text-gray-600">
                          <span>
                            {qty.toFixed(2)} x {unitPrice.toFixed(2)}
                          </span>
                          <span className="font-semibold text-gray-900">{lineTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {(!viewInvoice.items || viewInvoice.items.length === 0) && (
                    <div className="px-3 py-2 text-xs text-gray-500">No items recorded on this invoice.</div>
                  )}
                </div>
              </div>

              {(() => {
                const items = Array.isArray(viewInvoice.items) ? viewInvoice.items : [];
                const subtotalVal = typeof viewInvoice.subtotal === 'number'
                  ? Number(viewInvoice.subtotal)
                  : items.reduce(
                      (sum: number, it: any) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0),
                      0
                    );
                const discountVal = Number(viewInvoice.discount ?? 0);
                const totalVal = Number(viewInvoice.total ?? Math.max(0, subtotalVal - discountVal));

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
                    <div className="flex justify-between text-gray-900 font-semibold border-t border-dashed border-gray-200 pt-1 mt-1">
                      <span>Total</span>
                      <span>{totalVal.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}

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
              <button
                type="button"
                onClick={() => setViewInvoice(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{returnWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
    </div>
  );
}
