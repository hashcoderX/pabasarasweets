'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

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
  type: 'finished_product' | 'raw_material';
  out_price: number;
  sell_price: number;
  qty: number;
  created_at: string;
  updated_at: string;
}

interface InventoryItem {
  id: number;
  inventory_item_id?: number;
  grn_item_id?: number | null;
  batch_no?: string | null;
  batch_purchase_price?: number | null;
  batch_received_quantity?: number | null;
  batch_accepted_quantity?: number | null;
  batch_received_date?: string | null;
  name: string;
  code: string;
  type: 'raw_material' | 'finished_good';
  unit_price: number;
  sell_price?: number | null;
  purchase_price?: number | null;
  out_price?: number | null;
  current_stock: number;
  unit: string;
  additional_info?: Record<string, unknown> | string | null;
  last_batch_no?: string | null;
  lastBatchNo?: string | null;
  last_label_code?: string | null;
  lastLabelCode?: string | null;
  last_packaging_batch_id?: number | null;
  lastPackagingBatchId?: number | null;
}

type NoticeModalState = {
  title: string;
  message: string;
  tone: 'success' | 'error' | 'info';
};

type ConfirmModalState = {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => Promise<void> | void;
};
type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

const vehicleLoadingLoadItemsWidgetItems = [
  { id: 'vehicle-loading-load-items-hero-card', name: 'Vehicle Loading Load Items Hero Card' },
  { id: 'vehicle-loading-load-items-load-selection-card', name: 'Vehicle Loading Load Selection Card' },
  { id: 'vehicle-loading-load-items-workspace-card', name: 'Vehicle Loading Load Items Workspace Card' },
  { id: 'vehicle-loading-load-items-csv-modal-pane', name: 'Vehicle Loading Load Items CSV Modal Pane' },
];

export default function LoadItemsPage() {
  const [token, setToken] = useState('');
  const [loads, setLoads] = useState<Load[]>([]);
  const [selectedLoad, setSelectedLoad] = useState<Load | null>(null);
  const [loadItems, setLoadItems] = useState<LoadItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<LoadItem | null>(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [confirmingLoad, setConfirmingLoad] = useState(false);
  const [noticeModal, setNoticeModal] = useState<NoticeModalState | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [confirmModalLoading, setConfirmModalLoading] = useState(false);
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({});
  const [widgetControlsLocked, setWidgetControlsLocked] = useState(false);
  const [showSuperAdminConfirmModal, setShowSuperAdminConfirmModal] = useState(false);
  const [superAdminModalMode, setSuperAdminModalMode] = useState<SuperAdminModalMode>('apply');
  const [pendingWidgetChanges, setPendingWidgetChanges] = useState<WidgetVisibilityChange[]>([]);
  const [widgetVisibilitySnapshot, setWidgetVisibilitySnapshot] = useState<Record<string, boolean> | null>(null);
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [superAdminConfirmLoading, setSuperAdminConfirmLoading] = useState(false);
  const [restoreWidgetListVisible, setRestoreWidgetListVisible] = useState(false);
  const [restoreWidgetLoadingKey, setRestoreWidgetLoadingKey] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(-1);
  const itemInputRef = useRef<HTMLInputElement | null>(null);
  const itemDropdownRef = useRef<HTMLDivElement | null>(null);
  const [formData, setFormData] = useState({
    product_code: '',
    name: '',
    type: 'finished_product' as 'finished_product' | 'raw_material',
    out_price: '',
    sell_price: '',
    qty: ''
  });
  const router = useRouter();
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const hiddenWidgetCount = vehicleLoadingLoadItemsWidgetItems.filter((item) => widgetVisibility[item.id] === false).length;

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
      fetchInventoryItems();
      fetchWidgetVisibility(token);
    }
  }, [token]);

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

  const showRestoreWidgetList = () => {
    const hiddenKeys = vehicleLoadingLoadItemsWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
    if (!hiddenKeys.length) return;
    openSuperAdminConfirmation(hiddenKeys.map((key) => ({ widget_key: key, is_visible: true })), 'restore');
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
        lock_widget_controls: false,
      }, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const openUnlockWidgetsAfterFix = () => openSuperAdminConfirmation([], 'unlock');
  const unlockWidgetControls = async () => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    const fallbackWidgetKey = vehicleLoadingLoadItemsWidgetItems[0]?.id || 'vehicle-loading-load-items-hero-card';
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
    if (selectedLoad) {
      fetchLoadItems();
    }
  }, [selectedLoad]);

  const toSafeNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const resolveOutPrice = (item: InventoryItem): number => {
    const explicitOutPrice = toSafeNumber(item.out_price);
    const purchasePrice = toSafeNumber(item.purchase_price);
    const unitPrice = toSafeNumber(item.unit_price);
    const sellPrice = toSafeNumber(item.sell_price);

    if (explicitOutPrice > 0) return explicitOutPrice;
    if (purchasePrice > 0) return purchasePrice;
    if (unitPrice > 0) return unitPrice;
    if (sellPrice > 0) return sellPrice;
    return explicitOutPrice || purchasePrice || unitPrice || sellPrice || 0;
  };

  const resolveSellPrice = (item: InventoryItem): number => {
    const sellPrice = toSafeNumber(item.sell_price);
    const unitPrice = toSafeNumber(item.unit_price);
    const outPrice = toSafeNumber(item.out_price);

    if (sellPrice > 0) return sellPrice;
    if (unitPrice > 0) return unitPrice;
    if (outPrice > 0) return outPrice;
    return sellPrice || unitPrice || outPrice || 0;
  };

  const resolveAvailableQty = (item: InventoryItem): number => {
    if (item.type === 'raw_material' && item.grn_item_id) {
      const batchQty = toSafeNumber(item.batch_accepted_quantity ?? item.batch_received_quantity);
      if (batchQty > 0) return batchQty;
    }

    return toSafeNumber(item.current_stock);
  };

  const resolveAdditionalInfo = (item: InventoryItem): Record<string, unknown> => {
    const info = item.additional_info;
    if (!info) return {};

    if (typeof info === 'string') {
      try {
        return JSON.parse(info);
      } catch {
        return {};
      }
    }

    return info;
  };

  const extractApiErrorMessage = (error: unknown, fallback: string): string => {
    if (!error || typeof error !== 'object') return fallback;
    const errorRecord = error as { response?: { data?: { message?: unknown } } };
    const apiMessage = errorRecord.response?.data?.message;
    return typeof apiMessage === 'string' && apiMessage.trim() ? apiMessage : fallback;
  };

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.item-search-box')) {
        setShowItemDropdown(false);
        setHighlightedItemIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keep highlighted suggestion visible while navigating with keyboard.
  useEffect(() => {
    if (!showItemDropdown || highlightedItemIndex < 0 || !itemDropdownRef.current) return;

    const activeOption = itemDropdownRef.current.querySelector<HTMLElement>(`[data-index="${highlightedItemIndex}"]`);
    if (activeOption) {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedItemIndex, showItemDropdown]);

  const fetchLoads = async () => {
    try {
      const response = await axios.get('/api/vehicle-loading/loads', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const fetchedLoads: Load[] = Array.isArray(response.data) ? response.data : (response.data.data || []);
      setLoads(fetchedLoads.sort((first, second) => second.id - first.id));
    } catch (error) {
      console.error('Error fetching loads:', error);
      setLoads([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLoadItems = async () => {
    if (!selectedLoad) return;

    try {
      const response = await axios.get(`/api/vehicle-loading/load-items?load_id=${selectedLoad.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setLoadItems(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching load items:', error);
      setLoadItems([]);
    }
  };

  const fetchInventoryItems = async () => {
    try {
      const [finishedResponse, rawBatchResponse] = await Promise.all([
        axios.get('/api/stock/inventory', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            type: 'finished_good',
            status: 'active',
            per_page: 1000,
          },
        }),
        axios.get('/api/stock/inventory', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            type: 'raw_material',
            status: 'active',
            batch_view: true,
            per_page: 1000,
          },
        }),
      ]);

      const extractItems = (response: unknown): unknown[] => {
        const data = response && typeof response === 'object'
          ? (response as { data?: unknown }).data
          : null;
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown[] }).data)) return (data as { data: unknown[] }).data;
        if (data && typeof data === 'object') {
          const nested = (data as { data?: unknown }).data;
          if (nested && typeof nested === 'object' && Array.isArray((nested as { data?: unknown[] }).data)) {
            return (nested as { data: unknown[] }).data;
          }
        }
        return [];
      };

      const items = [
        ...extractItems(finishedResponse),
        ...extractItems(rawBatchResponse),
      ];

      const normalized: InventoryItem[] = items.map((item) => {
        const row = item as Record<string, unknown>;
        return ({
        id: Number(row.id) || 0,
        inventory_item_id: Number(row.inventory_item_id) || undefined,
        grn_item_id: row.grn_item_id !== undefined && row.grn_item_id !== null ? Number(row.grn_item_id) : null,
        batch_no: row.batch_no
          ? String(row.batch_no)
          : row.batch_number
            ? String(row.batch_number)
            : row.last_batch_no
              ? String(row.last_batch_no)
              : row.lastBatchNo
                ? String(row.lastBatchNo)
            : null,
        batch_purchase_price: row.batch_purchase_price !== undefined && row.batch_purchase_price !== null
          ? toSafeNumber(row.batch_purchase_price)
          : null,
        batch_received_quantity: row.batch_received_quantity !== undefined && row.batch_received_quantity !== null
          ? toSafeNumber(row.batch_received_quantity)
          : null,
        batch_accepted_quantity: row.batch_accepted_quantity !== undefined && row.batch_accepted_quantity !== null
          ? toSafeNumber(row.batch_accepted_quantity)
          : null,
        batch_received_date: row.batch_received_date ? String(row.batch_received_date) : null,
        name: String(row.name || ''),
        code: String(row.code || ''),
        type: (row.type === 'raw_material' ? 'raw_material' : 'finished_good') as 'raw_material' | 'finished_good',
        unit_price: toSafeNumber(row.unit_price),
        sell_price: toSafeNumber(row.sell_price),
        purchase_price: toSafeNumber(row.purchase_price),
        out_price: toSafeNumber(row.out_price),
        current_stock: toSafeNumber(row.current_stock),
        unit: String(row.unit || ''),
        additional_info: (row.additional_info as Record<string, unknown> | string | null | undefined) ?? null,
        last_batch_no: row.last_batch_no ? String(row.last_batch_no) : null,
        lastBatchNo: row.lastBatchNo ? String(row.lastBatchNo) : null,
        last_label_code: row.last_label_code ? String(row.last_label_code) : null,
        lastLabelCode: row.lastLabelCode ? String(row.lastLabelCode) : null,
        last_packaging_batch_id: row.last_packaging_batch_id !== undefined && row.last_packaging_batch_id !== null
          ? Number(row.last_packaging_batch_id)
          : null,
        lastPackagingBatchId: row.lastPackagingBatchId !== undefined && row.lastPackagingBatchId !== null
          ? Number(row.lastPackagingBatchId)
          : null,
      });
      }).filter((rowItem) => rowItem.id > 0 && resolveAvailableQty(rowItem) > 0);

      setInventoryItems(normalized);
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      setInventoryItems([]);
    }
  };

  const formatBatchLabel = (item: InventoryItem): string => {
    const info = resolveAdditionalInfo(item);
    const batchNo =
      item.batch_no ||
      item.last_batch_no ||
      item.lastBatchNo ||
      info.last_batch_no ||
      info.lastBatchNo ||
      info.batch_no ||
      info.batchNo ||
      info.batch_number ||
      info.batchNumber;
    if (batchNo) return String(batchNo);

    const labelCode = item.last_label_code || item.lastLabelCode || info.last_label_code || info.lastLabelCode;
    if (labelCode) return String(labelCode);

    const packagingBatchId = item.last_packaging_batch_id || item.lastPackagingBatchId || info.last_packaging_batch_id || info.lastPackagingBatchId;
    if (packagingBatchId) return `Batch #${packagingBatchId}`;

    if (item.grn_item_id) return `GRN Item #${item.grn_item_id}`;
    return 'General';
  };

  const selectInventoryItem = (item: InventoryItem) => {
    const outPrice = resolveOutPrice(item);
    const sellPrice = resolveSellPrice(item);
    const availableQty = resolveAvailableQty(item);
    const batchLabel = formatBatchLabel(item);

    setFormData((prev) => ({
      ...prev,
      product_code: item.code,
      name: item.name,
      type: item.type === 'finished_good' ? 'finished_product' : 'raw_material',
      out_price: outPrice.toFixed(2),
      sell_price: sellPrice.toFixed(2),
      qty: prev.qty || availableQty.toFixed(2),
    }));
    setItemSearch(`${item.code} - ${item.name} | Batch: ${batchLabel}`);
    setShowItemDropdown(false);
    setHighlightedItemIndex(-1);
    itemInputRef.current?.focus();
  };

  const handleItemSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = e.key;
    const isArrowDown = key === 'ArrowDown' || key === 'Down';
    const isArrowUp = key === 'ArrowUp' || key === 'Up';
    const isEnter = key === 'Enter';
    const isEscape = key === 'Escape' || key === 'Esc';
    const hasOptions = filteredInventoryItems.length > 0;

    if (isArrowDown || isArrowUp) {
      if (!hasOptions) return;

      e.preventDefault();
      e.stopPropagation();

      if (!showItemDropdown) {
        setShowItemDropdown(true);
      }

      setHighlightedItemIndex((prev) => {
        if (isArrowDown) {
          if (prev < 0) return 0;
          return prev < filteredInventoryItems.length - 1 ? prev + 1 : 0;
        }

        if (prev < 0) return filteredInventoryItems.length - 1;
        return prev > 0 ? prev - 1 : filteredInventoryItems.length - 1;
      });
      return;
    }

    if (isEnter && showItemDropdown && hasOptions) {
      e.preventDefault();
      e.stopPropagation();
      const targetIndex = highlightedItemIndex >= 0 ? highlightedItemIndex : 0;
      const picked = filteredInventoryItems[targetIndex];
      if (picked) {
        selectInventoryItem(picked);
      }
      return;
    }

    if (isEscape && showItemDropdown) {
      e.preventDefault();
      setShowItemDropdown(false);
      setHighlightedItemIndex(-1);
    }
  };

  const resetForm = () => {
    setFormData({
      product_code: '',
      name: '',
      type: 'finished_product',
      out_price: '',
      sell_price: '',
      qty: ''
    });
    setItemSearch('');
    setShowItemDropdown(false);
    setHighlightedItemIndex(-1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoad) return;

    try {
      const payload = {
        load_id: selectedLoad.id,
        product_code: formData.product_code,
        name: formData.name,
        type: formData.type,
        out_price: parseFloat(formData.out_price),
        sell_price: parseFloat(formData.sell_price),
        qty: parseFloat(formData.qty)
      };

      if (editingItem) {
        await axios.put(`/api/vehicle-loading/load-items/${editingItem.id}`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } else {
        await axios.post('/api/vehicle-loading/load-items', payload, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      fetchLoadItems();
      setEditingItem(null);
      resetForm();
    } catch (error: unknown) {
      console.error('Error saving load item:', error);
      setNoticeModal({
        title: 'Save Failed',
        message: extractApiErrorMessage(error, 'Failed to save load item'),
        tone: 'error',
      });
    }
  };

  const handleEdit = (item: LoadItem) => {
    setEditingItem(item);
    setFormData({
      product_code: item.product_code,
      name: item.name,
      type: item.type,
      out_price: item.out_price.toString(),
      sell_price: item.sell_price.toString(),
      qty: item.qty.toString()
    });
    setItemSearch(`${item.product_code} - ${item.name}`);
    setShowItemDropdown(false);
    setHighlightedItemIndex(-1);
  };

  const handleDelete = async (id: number) => {
    setConfirmModal({
      title: 'Delete Load Item',
      message: 'Are you sure you want to delete this load item?',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await axios.delete(`/api/vehicle-loading/load-items/${id}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          fetchLoadItems();
          setNoticeModal({
            title: 'Item Deleted',
            message: 'Load item removed successfully.',
            tone: 'success',
          });
        } catch (error) {
          console.error('Error deleting load item:', error);
          setNoticeModal({
            title: 'Delete Failed',
            message: 'Failed to delete load item.',
            tone: 'error',
          });
        }
      },
    });
  };

  const handleCsvUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLoad) return;

    const formDataCsv = new FormData(e.currentTarget);
    formDataCsv.append('load_id', selectedLoad.id.toString());

    try {
      const response = await axios.post('/api/vehicle-loading/load-items/upload-csv', formDataCsv, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      setNoticeModal({
        title: 'CSV Upload',
        message: response.data.message || 'CSV processed.',
        tone: 'success',
      });
      if (response.data.imported > 0) {
        fetchLoadItems();
        setShowCsvModal(false);
      }
    } catch (error: unknown) {
      console.error('Error uploading CSV:', error);
      setNoticeModal({
        title: 'Upload Failed',
        message: extractApiErrorMessage(error, 'Failed to upload CSV'),
        tone: 'error',
      });
    }
  };

  const getTotalValue = () => {
    return loadItems.reduce((total, item) => total + (item.sell_price * item.qty), 0);
  };

  const formatDisplayDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getLoadStatusClass = (status: Load['status']) => {
    switch (status) {
      case 'pending':
        return 'border border-amber-200 bg-amber-100 text-amber-700';
      case 'in_transit':
        return 'border border-blue-200 bg-blue-100 text-blue-700';
      case 'delivered':
        return 'border border-emerald-200 bg-emerald-100 text-emerald-700';
      case 'cancelled':
        return 'border border-rose-200 bg-rose-100 text-rose-700';
      default:
        return 'border border-slate-200 bg-slate-100 text-slate-700';
    }
  };

  const getItemTypeClass = (type: LoadItem['type']) => {
    return type === 'finished_product'
      ? 'border border-emerald-200 bg-emerald-100 text-emerald-700'
      : 'border border-cyan-200 bg-cyan-100 text-cyan-700';
  };

  const inputClass = 'w-full rounded-xl border border-emerald-200 bg-white/90 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100';
  const sectionCardClass = 'rounded-2xl border border-white/60 bg-white/90 shadow-[0_18px_65px_-35px_rgba(16,185,129,0.45)] backdrop-blur-lg';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';

  const filteredInventoryItems = inventoryItems
    .filter((item) => {
      const search = itemSearch.trim().toLowerCase();
      if (!search) return true;
      return item.name.toLowerCase().includes(search) || item.code.toLowerCase().includes(search);
    })
    .slice(0, 12);

  useEffect(() => {
    if (!showItemDropdown) return;
    if (filteredInventoryItems.length === 0) {
      setHighlightedItemIndex(-1);
      return;
    }

    if (highlightedItemIndex < 0 || highlightedItemIndex >= filteredInventoryItems.length) {
      setHighlightedItemIndex(0);
    }
  }, [showItemDropdown, filteredInventoryItems.length, highlightedItemIndex]);

  const handleConfirmLoad = async () => {
    if (!selectedLoad) return;
    if (selectedLoad.status !== 'pending') return;
    if (loadItems.length === 0) {
      setNoticeModal({
        title: 'Cannot Confirm Load',
        message: 'Add at least one load item before confirming this load.',
        tone: 'info',
      });
      return;
    }

    setConfirmModal({
      title: 'Confirm Load',
      message: 'Confirm this load? This action will set status to In Transit.',
      confirmText: 'Confirm',
      onConfirm: async () => {
        try {
          setConfirmingLoad(true);
          await axios.put(`/api/vehicle-loading/loads/${selectedLoad.id}`, {
            load_number: selectedLoad.load_number,
            vehicle_id: selectedLoad.vehicle_id,
            driver_id: selectedLoad.driver_id,
            sales_ref_id: selectedLoad.sales_ref_id ?? null,
            route_id: selectedLoad.route_id,
            status: 'in_transit',
            load_date: selectedLoad.load_date,
            delivery_date: selectedLoad.delivery_date,
            total_weight: selectedLoad.total_weight,
            notes: selectedLoad.notes || null,
          }, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          await fetchLoads();
          setSelectedLoad((prev) => (prev ? { ...prev, status: 'in_transit' } : prev));
          setNoticeModal({
            title: 'Load Confirmed',
            message: 'Load confirmed successfully.',
            tone: 'success',
          });
        } catch (error) {
          console.error('Error confirming load:', error);
          setNoticeModal({
            title: 'Confirmation Failed',
            message: 'Failed to confirm load.',
            tone: 'error',
          });
        } finally {
          setConfirmingLoad(false);
        }
      },
    });
  };

  const handleConfirmModalProceed = async () => {
    if (!confirmModal) return;

    try {
      setConfirmModalLoading(true);
      await confirmModal.onConfirm();
      setConfirmModal(null);
    } finally {
      setConfirmModalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_100%)]">
        <div className="h-14 w-14 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen p-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_30%),linear-gradient(180deg,_#f0fdf4_0%,_#eff6ff_55%,_#f8fafc_100%)]" />
      <div className="max-w-7xl mx-auto">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Widget Controls</h3>
              <p className="text-xs text-slate-500">Hide widgets, fix controls, restore hidden widgets, and unlock controls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => openSuperAdminConfirmation(pendingWidgetChanges, 'apply')} disabled={widgetControlsLocked || pendingWidgetChanges.length === 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Fix Widgets</button>
              <button type="button" onClick={showRestoreWidgetList} disabled={hiddenWidgetCount === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Restore Widgets ({hiddenWidgetCount})</button>
              <button type="button" onClick={openUnlockWidgetsAfterFix} disabled={!widgetControlsLocked} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 disabled:opacity-60">Unlock Widgets</button>
            </div>
          </div>
        </section>

        {/* Header */}
        {isWidgetVisible('vehicle-loading-load-items-hero-card') && <div className="rounded-[28px] border border-white/70 bg-white/85 p-6 mb-6 shadow-[0_26px_90px_-45px_rgba(16,185,129,0.5)] backdrop-blur-xl">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Load Items Management</h1>
              <p className="text-slate-600 mt-2">Manage item-wise loading with quick search, editing, and export tools.</p>
            </div>
            <button
              onClick={() => router.push('/dashboard/vehicle-loading/loads')}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Back to Loads
            </button>
          </div>
          {!widgetControlsLocked && <div className="mt-3"><button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-load-items-hero-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </div>}

        {/* Load Selection */}
        {isWidgetVisible('vehicle-loading-load-items-load-selection-card') && <div className={`${sectionCardClass} p-6 mb-6`}>
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Select Load</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loads.map((load) => (
              <div
                key={load.id}
                onClick={() => setSelectedLoad(load)}
                className={`p-4 rounded-2xl cursor-pointer transition-all border ${
                  selectedLoad?.id === load.id
                    ? 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-cyan-50 shadow-md'
                    : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm'
                }`}
              >
                <div className="font-semibold text-slate-900">{load.load_number}</div>
                <div className="text-sm text-slate-600">
                  {load.vehicle?.registration_number} - {load.route?.name}
                </div>
                <div className="text-sm text-slate-500">{formatDisplayDate(load.load_date)}</div>
                <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase mt-2 ${getLoadStatusClass(load.status)}`}>
                  {load.status.replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
          {!widgetControlsLocked && <div className="mt-3"><button type="button" onClick={() => stageWidgetVisibilityChange('vehicle-loading-load-items-load-selection-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </div>}

        {isWidgetVisible('vehicle-loading-load-items-workspace-card') && selectedLoad && (
          <>
            {/* Load Summary */}
            <div className={`${sectionCardClass} p-6 mb-6`}>
              <h2 className="text-xl font-semibold text-slate-900 mb-4">
                Load: {selectedLoad.load_number}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Vehicle</div>
                  <div className="font-semibold text-slate-900 mt-1">
                    {selectedLoad.vehicle?.registration_number}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Route</div>
                  <div className="font-semibold text-slate-900 mt-1">
                    {selectedLoad.route?.name}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Total Items</div>
                  <div className="font-semibold text-slate-900 mt-1">{loadItems.length}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Total Value</div>
                  <div className="font-semibold text-slate-900 mt-1">
                    LKR {getTotalValue().toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div className={`${sectionCardClass} relative z-30 overflow-visible p-6 mb-6`}>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                {editingItem ? 'Edit Load Item' : 'Add New Load Item'}
              </h3>
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4 items-end">
                  <div className="relative z-50 item-search-box md:col-span-2 xl:col-span-3">
                    <label className={labelClass}>
                      Item Search
                    </label>
                    <input
                      ref={itemInputRef}
                      type="text"
                      value={itemSearch}
                      onChange={(e) => {
                        setItemSearch(e.target.value);
                        if (!e.target.value.trim()) {
                          setFormData({ ...formData, product_code: '', name: '', out_price: '', sell_price: '' });
                        }
                        setShowItemDropdown(true);
                        setHighlightedItemIndex(-1);
                      }}
                      onFocus={() => {
                        setShowItemDropdown(true);
                        setHighlightedItemIndex(filteredInventoryItems.length > 0 ? 0 : -1);
                      }}
                      onKeyDownCapture={handleItemSearchKeyDown}
                      onKeyDown={handleItemSearchKeyDown}
                      placeholder="Type item code or name"
                      className={inputClass}
                    />
                    {showItemDropdown && filteredInventoryItems.length > 0 && (
                      <div ref={itemDropdownRef} className="z-[120] mt-2 w-full rounded-xl border border-emerald-100 bg-white shadow-2xl max-h-56 overflow-y-auto lg:absolute lg:left-0 lg:top-full">
                        {filteredInventoryItems.map((item, index) => {
                          const availableQty = resolveAvailableQty(item);
                          const batchLabel = formatBatchLabel(item);
                          return (
                          <button
                            key={`${item.inventory_item_id || item.id}-${item.grn_item_id || item.id}-${index}`}
                            type="button"
                            data-index={index}
                            onClick={() => selectInventoryItem(item)}
                            className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 ${
                              highlightedItemIndex === index ? 'bg-emerald-100' : 'hover:bg-emerald-50'
                            }`}
                          >
                            <div className="text-sm font-medium text-slate-900">{item.code} - {item.name}</div>
                            <div className="text-xs text-slate-500">Batch: {batchLabel} | Qty: {availableQty.toFixed(2)} {item.unit}</div>
                            <div className="text-xs text-slate-500">
                              Out: LKR {resolveOutPrice(item).toFixed(2)} | Sell: LKR {resolveSellPrice(item).toFixed(2)}
                            </div>
                          </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="xl:col-span-2">
                    <label className={labelClass}>
                      Product Code *
                    </label>
                    <input
                      type="text"
                      value={formData.product_code}
                      onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                      className={inputClass}
                      placeholder="PROD001"
                      required
                    />
                  </div>
                  <div className="xl:col-span-2">
                    <label className={labelClass}>
                      Product Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={inputClass}
                      placeholder="Product name"
                      required
                    />
                  </div>
                  <div className="xl:col-span-1">
                    <label className={labelClass}>
                      Type *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'finished_product' | 'raw_material' })}
                      className={inputClass}
                      required
                    >
                      <option value="finished_product">Finished Product</option>
                      <option value="raw_material">Raw Material</option>
                    </select>
                  </div>
                  <div className="xl:col-span-1">
                    <label className={labelClass}>
                      Out Price *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.out_price}
                      onChange={(e) => setFormData({ ...formData, out_price: e.target.value })}
                      className={inputClass}
                      placeholder="100.00"
                      required
                    />
                  </div>
                  <div className="xl:col-span-1">
                    <label className={labelClass}>
                      Sell Price *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.sell_price}
                      onChange={(e) => setFormData({ ...formData, sell_price: e.target.value })}
                      className={inputClass}
                      placeholder="150.00"
                      required
                    />
                  </div>
                  <div className="xl:col-span-1">
                    <label className={labelClass}>
                      Quantity *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.qty}
                      onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
                      className={inputClass}
                      placeholder="10.00"
                      required
                    />
                  </div>
                  <div className="md:col-span-2 xl:col-span-2 flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        resetForm();
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Clear
                    </button>
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {editingItem ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        )}
                      </svg>
                      {editingItem ? 'Update' : 'Add'}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Load Items Table */}
            <div className={`${sectionCardClass} relative z-10 overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-100/80">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Product Code
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Out Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Sell Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Quantity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Total Value
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {loadItems.map((item) => (
                      <tr key={item.id} className="transition hover:bg-emerald-50/35">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900">
                          {item.product_code}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          {item.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${getItemTypeClass(item.type)}`}>
                            {item.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          LKR {item.out_price.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          LKR {item.sell_price.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                          {item.qty.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">
                          LKR {(item.sell_price * item.qty).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-indigo-600 hover:text-indigo-900 mr-4"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className={`${sectionCardClass} p-6 mt-6`}>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-slate-900">Load Items</h2>
                <div className="space-x-3">
                  <button
                    onClick={handleConfirmLoad}
                    disabled={loadItems.length === 0 || !selectedLoad || selectedLoad.status !== 'pending' || confirmingLoad}
                    className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200/70 transition hover:from-violet-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {confirmingLoad ? 'Confirming...' : selectedLoad?.status === 'pending' ? 'Load Confirm' : 'Load Confirmed'}
                  </button>
                  <button
                    onClick={() => setShowCsvModal(true)}
                    className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-200/70 transition hover:from-blue-700 hover:to-cyan-700"
                  >
                    Upload CSV
                  </button>
                  <button
                    onClick={() => {
                      setEditingItem(null);
                      resetForm();
                    }}
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700"
                  >
                    New Item
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* CSV Upload Modal */}
        {isWidgetVisible('vehicle-loading-load-items-csv-modal-pane') && showCsvModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/45 px-4 py-8 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-3xl">
              <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/90 shadow-[0_30px_120px_-50px_rgba(16,185,129,0.55)] backdrop-blur-xl">
                <div className="flex items-start justify-between border-b border-white/70 bg-gradient-to-r from-blue-600 via-cyan-600 to-emerald-600 px-6 py-5 text-white">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">Bulk Import</p>
                    <h3 className="mt-1 text-2xl font-bold">Upload CSV File</h3>
                  </div>
                  <button
                    onClick={() => setShowCsvModal(false)}
                    className="rounded-full border border-white/40 bg-white/20 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/30"
                  >
                    Close
                  </button>
                </div>
                <div className="px-6 py-6">
                <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <h4 className="font-semibold text-blue-800 mb-2">CSV Format:</h4>
                  <p className="text-sm text-blue-700 mb-2">
                    The CSV file should have the following columns (without header):
                  </p>
                  <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
                    <li>Product Code</li>
                    <li>Product Name</li>
                    <li>Type (finished_product or raw_material)</li>
                    <li>Out Price</li>
                    <li>Sell Price</li>
                    <li>Quantity</li>
                  </ol>
                  <p className="text-sm text-blue-700 mt-2">
                    Example: PROD001,Sample Product,finished_product,100.00,150.00,10.00
                  </p>
                </div>
                <form onSubmit={handleCsvUpload}>
                  <div className="mb-4">
                    <label className={labelClass}>
                      CSV File *
                    </label>
                    <input
                      type="file"
                      name="csv_file"
                      accept=".csv"
                      className={inputClass}
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-3 border-t border-slate-200/80 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowCsvModal(false)}
                      className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/70 transition hover:from-emerald-700 hover:to-teal-700"
                    >
                      Upload CSV
                    </button>
                  </div>
                </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{vehicleLoadingLoadItemsWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}

        {confirmModal && (
          <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/45 px-4 py-8 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-md">
              <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_30px_100px_-45px_rgba(15,23,42,0.55)]">
                <div className="border-b border-slate-200 bg-gradient-to-r from-slate-700 to-slate-600 px-6 py-4 text-white">
                  <h3 className="text-lg font-semibold">{confirmModal.title}</h3>
                </div>
                <div className="px-6 py-5 text-sm text-slate-700">{confirmModal.message}</div>
                <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setConfirmModal(null)}
                    disabled={confirmModalLoading}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmModalProceed}
                    disabled={confirmModalLoading}
                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {confirmModalLoading ? 'Please wait...' : confirmModal.confirmText}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {noticeModal && (
          <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/45 px-4 py-8 backdrop-blur-sm">
            <div className="mx-auto w-full max-w-md">
              <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_30px_100px_-45px_rgba(15,23,42,0.55)]">
                <div className={`border-b px-6 py-4 text-white ${
                  noticeModal.tone === 'success'
                    ? 'border-emerald-200 bg-gradient-to-r from-emerald-600 to-teal-600'
                    : noticeModal.tone === 'error'
                      ? 'border-rose-200 bg-gradient-to-r from-rose-600 to-red-600'
                      : 'border-sky-200 bg-gradient-to-r from-sky-600 to-blue-600'
                }`}>
                  <h3 className="text-lg font-semibold">{noticeModal.title}</h3>
                </div>
                <div className="px-6 py-5 text-sm text-slate-700">{noticeModal.message}</div>
                <div className="flex justify-end border-t border-slate-200 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setNoticeModal(null)}
                    className="rounded-xl bg-gradient-to-r from-slate-700 to-slate-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-slate-800 hover:to-slate-700"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}