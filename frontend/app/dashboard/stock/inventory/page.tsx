'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';

interface InventoryItem {
  id: number;
  inventory_item_id?: number;
  grn_item_id?: number | null;
  name: string;
  code: string;
  description: string;
  type: 'raw_material' | 'finished_good';
  category: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  maximum_stock: number;
  unit_price: number;
  purchase_price?: number | null;
  sell_price?: number | null;
  batch_no?: string | null;
  batch_purchase_price?: number | null;
  batch_received_quantity?: number | null;
  batch_accepted_quantity?: number | null;
  batch_rejected_quantity?: number | null;
  batch_received_date?: string | null;
  batch_quality_status?: 'pending' | 'accepted' | 'rejected' | 'partial' | null;
  supplier_name: string | null;
  supplier_id: number | null;
  location: string;
  expiry_date: string | null;
  status: 'active' | 'inactive';
  additional_info?: {
    store_tag?: string;
    stock_source?: string;
    last_batch_no?: string;
    last_packaging_batch_id?: number;
    last_label_code?: string;
    last_barcode_value?: string;
    last_qr_value?: string;
    last_synced_at?: string;
    last_batch_unit_price?: number;
    last_batch_expiry_date?: string;
    lastPackagingBatchId?: number;
    lastBatchNo?: string;
    lastLabelCode?: string;
    lastBarcodeValue?: string;
    lastQrValue?: string;
    lastSyncedAt?: string;
  };
  supplier?: {
    id: number;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

export default function Inventory() {
  const [token, setToken] = useState('');
  const [activeTab, setActiveTab] = useState<'raw_material' | 'finished_good'>('raw_material');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    type: 'raw_material' as 'raw_material' | 'finished_good',
    category: '',
    unit: '',
    current_stock: 0,
    minimum_stock: 0,
    maximum_stock: 0,
    unit_price: 0,
    sell_price: '',
    supplier_name: '',
    supplier_id: '',
    location: '',
    expiry_date: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [selectedItemDetails, setSelectedItemDetails] = useState<InventoryItem | null>(null);
  const [showItemDetailsModal, setShowItemDetailsModal] = useState(false);
  const [itemFilterQuery, setItemFilterQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_stock'>('all');
  const [recordStatusFilter, setRecordStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [rawQualityFilter, setRawQualityFilter] = useState<'all' | 'pending' | 'accepted' | 'rejected' | 'partial'>('all');
  const [dbCategorySuggestions, setDbCategorySuggestions] = useState<string[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const router = useRouter();

  const toSafeNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const resolveItemPrice = (item: Partial<InventoryItem> | null | undefined): number => {
    if (!item) return 0;
    const unitPrice = toSafeNumber(item.unit_price);
    const purchasePrice = toSafeNumber(item.purchase_price);
    const sellPrice = toSafeNumber(item.sell_price);

    if (unitPrice > 0) return unitPrice;
    if (purchasePrice > 0) return purchasePrice;
    if (sellPrice > 0) return sellPrice;
    return unitPrice || purchasePrice || sellPrice || 0;
  };

  const suggestedCategories = useMemo(() => {
    const fromItems = items
      .map((item) => String(item.category || '').trim())
      .filter((category) => category.length > 0);

    const merged = [...fromItems, ...dbCategorySuggestions];
    return Array.from(new Set(merged.map((value) => value.toLowerCase())))
      .map((lowerValue) => merged.find((value) => value.toLowerCase() === lowerValue) || lowerValue)
      .sort((a, b) => a.localeCompare(b));
  }, [items, dbCategorySuggestions]);

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
      fetchSuppliers();
      fetchItems();
      fetchCategorySuggestions();
    }
  }, [token, activeTab]);

  useEffect(() => {
    setItemFilterQuery('');
    setStockFilter('all');
    setRecordStatusFilter('all');
    setRawQualityFilter('all');
  }, [activeTab]);

  const fetchSuppliers = async () => {
    try {
      const response = await axios.get('/api/stock/suppliers', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 1000 }
      });

      if (response.data.success) {
        setSuppliers(response.data.data.data || []);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/stock/inventory', {
        headers: { Authorization: `Bearer ${token}` },
        params: { type: activeTab, per_page: 100, batch_view: activeTab === 'raw_material' }
      });

      if (response.data.success) {
        const itemsData = response.data.data.data || [];
        const formattedItems = itemsData.map((item: any) => ({
          ...item,
          current_stock: toSafeNumber(item.current_stock),
          minimum_stock: toSafeNumber(item.minimum_stock),
          maximum_stock: toSafeNumber(item.maximum_stock),
          purchase_price: toSafeNumber(item.purchase_price),
          sell_price: toSafeNumber(item.sell_price),
          batch_purchase_price: item.batch_purchase_price !== undefined && item.batch_purchase_price !== null
            ? toSafeNumber(item.batch_purchase_price)
            : null,
          batch_received_quantity: item.batch_received_quantity !== undefined && item.batch_received_quantity !== null
            ? toSafeNumber(item.batch_received_quantity)
            : null,
          batch_accepted_quantity: item.batch_accepted_quantity !== undefined && item.batch_accepted_quantity !== null
            ? toSafeNumber(item.batch_accepted_quantity)
            : null,
          batch_rejected_quantity: item.batch_rejected_quantity !== undefined && item.batch_rejected_quantity !== null
            ? toSafeNumber(item.batch_rejected_quantity)
            : null,
          unit_price: resolveItemPrice(item),
        }));
        setItems(formattedItems);
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      // Mock data for development
      const mockItems: InventoryItem[] = activeTab === 'raw_material' ? [
        {
          id: 1,
          name: 'Steel Rods',
          code: 'STL-001',
          description: 'High-quality steel rods for construction',
          type: 'raw_material',
          category: 'Metals',
          unit: 'kg',
          current_stock: 500,
          minimum_stock: 100,
          maximum_stock: 1000,
          unit_price: 250.00,
          supplier_name: 'ABC Supplies Ltd',
          supplier_id: 1,
          location: 'Warehouse A - Section 1',
          expiry_date: null,
          status: 'active',
          created_at: '2024-01-15T10:00:00Z',
          updated_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 2,
          name: 'Cement Bags',
          code: 'CMT-001',
          description: 'Portland cement 50kg bags',
          type: 'raw_material',
          category: 'Construction Materials',
          unit: 'bags',
          current_stock: 200,
          minimum_stock: 50,
          maximum_stock: 500,
          unit_price: 850.00,
          supplier_name: 'Global Traders Inc',
          supplier_id: 2,
          location: 'Warehouse B - Section 2',
          expiry_date: null,
          status: 'active',
          created_at: '2024-01-20T14:30:00Z',
          updated_at: '2024-01-20T14:30:00Z'
        }
      ] : [
        {
          id: 3,
          name: 'Steel Door Frame',
          code: 'SDF-001',
          description: 'Pre-fabricated steel door frame',
          type: 'finished_good',
          category: 'Door Systems',
          unit: 'pieces',
          current_stock: 25,
          minimum_stock: 10,
          maximum_stock: 100,
          unit_price: 2500.00,
          supplier_name: null,
          supplier_id: null,
          location: 'Finished Goods Warehouse - Section A',
          expiry_date: null,
          status: 'active',
          created_at: '2024-01-25T09:00:00Z',
          updated_at: '2024-01-25T09:00:00Z'
        }
      ];
      setItems(mockItems);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategorySuggestions = async () => {
    try {
      const response = await axios.get('/api/stock/inventory-categories', {
        headers: { Authorization: `Bearer ${token}` },
        params: { type: activeTab, status: 'active' },
      });

      if (response.data?.success) {
        const categories = Array.isArray(response.data.data) ? response.data.data : [];
        setDbCategorySuggestions(
          categories
            .map((category: { name?: string }) => String(category?.name || '').trim())
            .filter((name: string) => name.length > 0)
        );
      }
    } catch (error) {
      console.error('Error fetching inventory categories:', error);
    }
  };

  const addCategorySuggestion = async () => {
    const normalized = formData.category.trim().replace(/\s+/g, ' ');

    if (!normalized) {
      alert('Type a category name first.');
      return;
    }

    try {
      setSavingCategory(true);
      const response = await axios.post('/api/stock/inventory-categories', {
        name: normalized,
        type: activeTab,
        status: 'active',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to save category.');
      }

      const savedName = String(response.data?.data?.name || normalized).trim();
      setFormData((prev) => ({ ...prev, category: savedName }));
      setDbCategorySuggestions((prev) => {
        if (prev.some((item) => item.toLowerCase() === savedName.toLowerCase())) return prev;
        return [...prev, savedName];
      });
      alert('Category saved successfully.');
    } catch (error: any) {
      console.error('Error saving category:', error);
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      alert(firstError?.[0] || error?.response?.data?.message || error?.message || 'Failed to save category.');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) return;

    try {
      setSaving(true);
      const submitData = {
        ...formData,
        type: activeTab,
        supplier_id: formData.supplier_id ? Number(formData.supplier_id) : null,
        sell_price: formData.sell_price.trim() === '' ? null : Number(formData.sell_price)
      };

      if (editingItem) {
        const response = await axios.put(`/api/stock/inventory/${editingItem.id}`, submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          setItems(prev => prev.map(item =>
            item.id === editingItem.id
              ? {
                  ...response.data.data,
                  current_stock: toSafeNumber(response.data.data.current_stock),
                  minimum_stock: toSafeNumber(response.data.data.minimum_stock),
                  maximum_stock: toSafeNumber(response.data.data.maximum_stock),
                  purchase_price: toSafeNumber(response.data.data.purchase_price),
                  sell_price: toSafeNumber(response.data.data.sell_price),
                  unit_price: resolveItemPrice(response.data.data),
                }
              : item
          ));
        } else {
          throw new Error(response.data.message || 'Failed to update item');
        }
      } else {
        const response = await axios.post('/api/stock/inventory', submitData, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.success) {
          setItems(prev => [
            ...prev,
            {
              ...response.data.data,
              current_stock: toSafeNumber(response.data.data.current_stock),
              minimum_stock: toSafeNumber(response.data.data.minimum_stock),
              maximum_stock: toSafeNumber(response.data.data.maximum_stock),
              purchase_price: toSafeNumber(response.data.data.purchase_price),
              sell_price: toSafeNumber(response.data.data.sell_price),
              unit_price: resolveItemPrice(response.data.data),
            },
          ]);
        } else {
          throw new Error(response.data.message || 'Failed to create item');
        }
      }

      setShowModal(false);
      setEditingItem(null);
      resetForm();
    } catch (error: any) {
      console.error('Error saving item:', error);
      alert(error.response?.data?.message || error.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      code: item.code,
      description: item.description || '',
      type: item.type,
      category: item.category || '',
      unit: item.unit,
      current_stock: item.current_stock,
      minimum_stock: item.minimum_stock,
      maximum_stock: item.maximum_stock || 0,
      unit_price: item.unit_price,
      sell_price: item.sell_price === null || item.sell_price === undefined ? '' : String(item.sell_price),
      supplier_name: item.supplier_name || '',
      supplier_id: item.supplier_id?.toString() || '',
      location: item.location || '',
      expiry_date: item.expiry_date ? item.expiry_date.split('T')[0] : '',
      status: item.status
    });
    setShowModal(true);
  };

  const openItemDetails = (item: InventoryItem) => {
    setSelectedItemDetails(item);
    setShowItemDetailsModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await axios.delete(`/api/stock/inventory/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setItems(prev => prev.filter(item => item.id !== id));
        setDeleteConfirm(null);
      } else {
        throw new Error(response.data.message || 'Failed to delete item');
      }
    } catch (error: any) {
      console.error('Error deleting item:', error);
      alert(error.response?.data?.message || error.message || 'Failed to delete item');
    }
  };

  const resetForm = () => {
    setSkuManuallyEdited(false);
    setFormData({
      name: '',
      code: '',
      description: '',
      type: activeTab,
      category: '',
      unit: '',
      current_stock: 0,
      minimum_stock: 0,
      maximum_stock: 0,
      unit_price: 0,
      sell_price: '',
      supplier_name: '',
      supplier_id: '',
      location: '',
      expiry_date: '',
      status: 'active'
    });
  };

  const openAddModal = () => {
    setEditingItem(null);
    setSkuManuallyEdited(false);
    resetForm();
    setShowModal(true);
  };

  const generateSkuCode = (name: string, type: 'raw_material' | 'finished_good') => {
    const prefix = type === 'raw_material' ? 'RM' : 'FG';
    const cleanedName = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').trim();
    const words = cleanedName.split(/\s+/).filter(Boolean);
    const core = cleanedName
      ? words.length > 1
        ? words.slice(0, 3).map((word) => word.slice(0, 2)).join('')
        : cleanedName.replace(/\s+/g, '').slice(0, 6)
      : 'ITEM';

    const normalizedCore = core.replace(/[^A-Z0-9]/g, '') || 'ITEM';
    const escapedCore = normalizedCore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${prefix}-${escapedCore}-(\\d{3})$`);

    const nextSerial = (items || [])
      .map((item) => {
        const match = String(item.code || '').toUpperCase().match(pattern);
        return match ? Number(match[1]) : 0;
      })
      .reduce((max, current) => Math.max(max, current), 0) + 1;

    const paddedSerial = String(nextSerial).padStart(3, '0');
    return `${prefix}-${normalizedCore}-${paddedSerial}`;
  };

  useEffect(() => {
    if (!showModal || editingItem || skuManuallyEdited) return;

    const autoCode = generateSkuCode(formData.name, activeTab);
    setFormData((prev) => {
      if (prev.code === autoCode) return prev;
      return { ...prev, code: autoCode };
    });
  }, [formData.name, activeTab, showModal, editingItem, skuManuallyEdited, items]);

  const getStockStatus = (item: InventoryItem) => {
    if (item.current_stock <= 0) return { status: 'Out of Stock', color: 'bg-red-100 text-red-800' };
    if (item.current_stock <= item.minimum_stock) return { status: 'Low Stock', color: 'bg-yellow-100 text-yellow-800' };
    if (item.maximum_stock && item.current_stock > item.maximum_stock) return { status: 'Overstocked', color: 'bg-blue-100 text-blue-800' };
    return { status: 'In Stock', color: 'bg-green-100 text-green-800' };
  };

  const resolveAdditionalInfo = (item: InventoryItem): Record<string, any> => {
    const info = item.additional_info;
    if (!info) return {};

    if (typeof info === 'string') {
      try {
        return JSON.parse(info);
      } catch {
        return {};
      }
    }

    return info as Record<string, any>;
  };

  const modalLabelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-600';
  const modalInputClass = 'mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none';
  const modalSelectClass = 'mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none';
  const modalTextareaClass = 'mt-1.5 block w-full rounded-xl border border-orange-100 bg-gradient-to-b from-white to-orange-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none';
  const uniqueStockItems = activeTab === 'raw_material'
    ? Array.from(new Map(items.map((item) => [item.inventory_item_id || item.id, item])).values())
    : items;
  const visibleItems = items.filter((item) => {
    if (activeTab === 'raw_material') {
      const batchQty = toSafeNumber(item.batch_accepted_quantity ?? item.batch_received_quantity ?? 0);
      return batchQty > 0;
    }

    return toSafeNumber(item.current_stock) > 0;
  });
  const filteredVisibleItems = useMemo(() => {
    const query = itemFilterQuery.trim().toLowerCase();

    return visibleItems.filter((item) => {
      if (query) {
        const inName = String(item.name || '').toLowerCase().includes(query);
        const inCode = String(item.code || '').toLowerCase().includes(query);
        const inCategory = String(item.category || '').toLowerCase().includes(query);
        if (!inName && !inCode && !inCategory) return false;
      }

      if (recordStatusFilter !== 'all' && item.status !== recordStatusFilter) {
        return false;
      }

      const stockStatus = getStockStatus(item).status;
      if (stockFilter === 'in_stock' && stockStatus !== 'In Stock') return false;
      if (stockFilter === 'low_stock' && stockStatus !== 'Low Stock') return false;
      if (stockFilter === 'out_stock' && stockStatus !== 'Out of Stock') return false;

      if (activeTab === 'raw_material' && rawQualityFilter !== 'all') {
        if ((item.batch_quality_status || 'pending') !== rawQualityFilter) {
          return false;
        }
      }

      return true;
    });
  }, [visibleItems, itemFilterQuery, recordStatusFilter, stockFilter, activeTab, rawQualityFilter]);
  const totalStockValue = items.reduce((sum, item) => sum + (item.current_stock * resolveItemPrice(item)), 0);
  const lowStockItems = uniqueStockItems.filter(item => item.current_stock <= item.minimum_stock).length;
  const inStockItems = uniqueStockItems.filter(item => item.current_stock > item.minimum_stock).length;

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.16),_transparent_23%),radial-gradient(circle_at_top_right,_rgba(245,158,11,0.14),_transparent_25%),linear-gradient(180deg,_#fffaf5_0%,_#fff7ed_42%,_#fff3e4_100%)] p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="overflow-hidden rounded-[30px] border border-white/70 bg-white/75 shadow-[0_26px_90px_-45px_rgba(194,65,12,0.5)] backdrop-blur-xl">
        <div className="grid gap-8 px-5 py-6 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:px-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm font-semibold text-orange-700">
              <span className="h-2 w-2 rounded-full bg-orange-500"></span>
              Inventory command center
            </div>
            <div>
              <h3 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Inventory Management
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Manage raw materials and finished goods with richer visibility, cleaner records, and faster item-level decisions.
              </p>
            </div>
            <button
              onClick={openAddModal}
              className="inline-flex items-center rounded-full bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-300/50 transition hover:scale-[1.02] hover:from-orange-600 hover:to-yellow-500"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-3xl border border-orange-200/70 bg-gradient-to-br from-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-300/45">
              <p className="text-xs uppercase tracking-[0.24em] text-white/80">Total Items</p>
              <p className="mt-2 text-3xl font-bold">{uniqueStockItems.length}</p>
              <p className="mt-2 text-sm text-white/85">LKR {totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} inventory value</p>
            </div>
            <div className="rounded-3xl border border-red-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-red-500">Low Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{lowStockItems}</p>
              <p className="mt-2 text-sm text-slate-500">Need replenishment attention</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Healthy Stock</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{inStockItems}</p>
              <p className="mt-2 text-sm text-slate-500">Above minimum stock threshold</p>
            </div>
          </div>
        </div>
      </div>

      {/* Store Tabs */}
      <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_65px_-35px_rgba(194,65,12,0.42)]">
        <div className="border-b border-orange-100 bg-gradient-to-r from-white via-orange-50/70 to-amber-50/70">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('raw_material')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'raw_material'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-orange-200'
              }`}
            >
              Raw Material Store
            </button>
            <button
              onClick={() => setActiveTab('finished_good')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'finished_good'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-orange-200'
              }`}
            >
              Finished Goods Store
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Stats Cards */}
          <div className="mb-2 flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50/60 px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-600">Inventory Snapshot</p>
            <p className="text-xs text-orange-700">Tip: click any row to view full item details</p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <div className="overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-bold">📦</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Total Items
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {uniqueStockItems.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-white">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-bold">⚠️</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Low Stock Items
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {lowStockItems}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-bold">✅</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        In Stock Items
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {inStockItems}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                      <span className="text-white text-sm font-bold">💰</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Total Value
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        LKR {totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-orange-600">Filter Items</p>
              <button
                type="button"
                onClick={() => {
                  setItemFilterQuery('');
                  setStockFilter('all');
                  setRecordStatusFilter('all');
                  setRawQualityFilter('all');
                }}
                className="text-xs font-semibold text-slate-600 underline hover:text-slate-800"
              >
                Reset Filters
              </button>
            </div>
            <div className={`grid grid-cols-1 gap-3 ${activeTab === 'raw_material' ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Search</label>
                <input
                  type="text"
                  value={itemFilterQuery}
                  onChange={(e) => setItemFilterQuery(e.target.value)}
                  placeholder="Name, code, or category"
                  className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Stock Status</label>
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as 'all' | 'in_stock' | 'low_stock' | 'out_stock')}
                  className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  <option value="all">All</option>
                  <option value="in_stock">In Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_stock">Out of Stock</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Record Status</label>
                <select
                  value={recordStatusFilter}
                  onChange={(e) => setRecordStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                  className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {activeTab === 'raw_material' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Batch Quality</label>
                  <select
                    value={rawQualityFilter}
                    onChange={(e) => setRawQualityFilter(e.target.value as 'all' | 'pending' | 'accepted' | 'rejected' | 'partial')}
                    className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100"
                  >
                    <option value="all">All</option>
                    <option value="accepted">Accepted</option>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Showing {filteredVisibleItems.length} of {visibleItems.length} item(s)
            </p>
          </div>

          {/* Items Table */}
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
            </div>
          ) : filteredVisibleItems.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-400 text-sm">No items found in this store</div>
              <button
                onClick={openAddModal}
                className="mt-4 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200"
              >
                Add First Item
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_16px_55px_-35px_rgba(194,65,12,0.45)]">
              <div className="border-b border-orange-100 bg-gradient-to-r from-slate-900 via-orange-900 to-amber-800 px-5 py-3.5">
                <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-100">
                  {activeTab === 'raw_material' ? 'Raw Material Inventory (Batch View)' : 'Finished Goods Inventory'}
                </h4>
              </div>
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Item
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      {activeTab === 'raw_material' ? 'Batch Qty' : 'Stock Info'}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Batch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-[0.16em]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredVisibleItems.map((item) => {
                    const stockStatus = getStockStatus(item);
                    const resolvedPrice = resolveItemPrice(item);
                    const info = resolveAdditionalInfo(item);
                    const batchNo = item.batch_no || info.last_batch_no || info.lastBatchNo || '';
                    const labelCode = info.last_label_code || info.lastLabelCode || '';
                    const storeTag = info.store_tag || info.storeTag || '';
                    const stockSource = info.stock_source || info.stockSource || '';
                    const packagingBatchId = info.last_packaging_batch_id || info.lastPackagingBatchId;
                    const baseItemId = item.inventory_item_id || item.id;
                    const displayPrice = activeTab === 'raw_material'
                      ? toSafeNumber(item.batch_purchase_price ?? item.purchase_price ?? item.unit_price)
                      : resolvedPrice;
                    return (
                      <tr
                        key={`${baseItemId}-${item.grn_item_id ?? item.id}`}
                        onClick={() => openItemDetails(item)}
                        className="cursor-pointer transition hover:bg-orange-50/45"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                                <span className="text-orange-600 font-medium text-sm">
                                  {item.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {item.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {item.code} • {item.category || 'Uncategorized'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {activeTab === 'raw_material' ? (
                            <>
                              <div className="text-sm font-semibold text-gray-900">
                                {toSafeNumber(item.batch_accepted_quantity ?? item.batch_received_quantity ?? 0).toFixed(2)} {item.unit}
                              </div>
                              <div className="text-sm text-gray-500">
                                Total Item Stock: {toSafeNumber(item.current_stock).toFixed(2)} {item.unit}
                              </div>
                              <div className="text-xs text-gray-500">
                                Min: {toSafeNumber(item.minimum_stock).toFixed(2)} {item.unit}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="text-sm text-gray-900">
                                {item.current_stock} {item.unit}
                              </div>
                              <div className="text-sm text-gray-500">
                                Min: {item.minimum_stock} {item.unit}
                              </div>
                            </>
                          )}
                          {item.location && (
                            <div className="text-xs text-gray-400">
                              {item.location}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {batchNo || labelCode || (packagingBatchId ? `Batch #${packagingBatchId}` : '-')}
                          </div>
                          {activeTab === 'raw_material' && item.batch_received_date && (
                            <div className="text-xs text-gray-500 mt-1">
                              Received: {new Date(item.batch_received_date).toLocaleDateString()}
                            </div>
                          )}
                          {activeTab === 'raw_material' && (
                            <div className="text-xs text-gray-600 mt-1">
                              Qty: {toSafeNumber(item.batch_accepted_quantity ?? item.batch_received_quantity ?? 0).toFixed(2)} {item.unit}
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            {storeTag && (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                {String(storeTag).replace('_', ' ').toUpperCase()}
                              </span>
                            )}
                            {stockSource && (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                {String(stockSource).toUpperCase()}
                              </span>
                            )}
                            {activeTab === 'raw_material' && item.batch_quality_status && (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                                {item.batch_quality_status.toUpperCase()}
                              </span>
                            )}
                          </div>
                          {packagingBatchId && (
                            <div className="text-xs text-gray-500 mt-1">
                              Batch #{packagingBatchId}
                            </div>
                          )}
                          {activeTab === 'finished_good' && !labelCode && !packagingBatchId && (
                            <div className="text-xs text-amber-600 mt-1">Not synced from packaging yet</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-800">
                          LKR {displayPrice.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${stockStatus.color}`}>
                            {stockStatus.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit({ ...item, id: baseItemId });
                            }}
                            className="mr-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirm(baseItemId);
                            }}
                            className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Item Details Modal */}
      {showItemDetailsModal && selectedItemDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_34px_120px_-40px_rgba(194,65,12,0.58)]">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.36),_transparent_45%),linear-gradient(125deg,_rgba(154,52,18,0.95)_0%,_rgba(234,88,12,0.94)_45%,_rgba(249,115,22,0.9)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    🔎
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Item Details</h3>
                  <p className="mt-2 text-sm text-white/85 sm:text-base">
                    {selectedItemDetails.name} • {selectedItemDetails.code}
                  </p>
                </div>
                <button
                  onClick={() => setShowItemDetailsModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-5 px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Identity</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Name:</span> {selectedItemDetails.name}</p>
                      <p><span className="font-semibold text-slate-900">Code:</span> {selectedItemDetails.code}</p>
                      <p><span className="font-semibold text-slate-900">Category:</span> {selectedItemDetails.category || 'Uncategorized'}</p>
                      <p><span className="font-semibold text-slate-900">Type:</span> {selectedItemDetails.type === 'raw_material' ? 'Raw Material' : 'Finished Good'}</p>
                      <p><span className="font-semibold text-slate-900">Unit:</span> {selectedItemDetails.unit}</p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Stock and Commercial</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Current Stock:</span> {selectedItemDetails.current_stock} {selectedItemDetails.unit}</p>
                      <p><span className="font-semibold text-slate-900">Minimum Stock:</span> {selectedItemDetails.minimum_stock} {selectedItemDetails.unit}</p>
                      <p><span className="font-semibold text-slate-900">Maximum Stock:</span> {selectedItemDetails.maximum_stock || 0} {selectedItemDetails.unit}</p>
                      <p><span className="font-semibold text-slate-900">Unit Price:</span> LKR {resolveItemPrice(selectedItemDetails).toFixed(2)}</p>
                      {selectedItemDetails.purchase_price !== undefined && (
                        <p><span className="font-semibold text-slate-900">Purchase Price:</span> LKR {toSafeNumber(selectedItemDetails.purchase_price).toFixed(2)}</p>
                      )}
                      {selectedItemDetails.sell_price !== undefined && (
                        <p><span className="font-semibold text-slate-900">Sell Price:</span> LKR {toSafeNumber(selectedItemDetails.sell_price).toFixed(2)}</p>
                      )}
                    </div>
                  </section>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-500">Supplier and Location</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Supplier:</span> {selectedItemDetails.supplier_name || selectedItemDetails.supplier?.name || 'Not assigned'}</p>
                      <p><span className="font-semibold text-slate-900">Location:</span> {selectedItemDetails.location || 'Not set'}</p>
                      <p><span className="font-semibold text-slate-900">Expiry Date:</span> {selectedItemDetails.expiry_date ? new Date(selectedItemDetails.expiry_date).toLocaleDateString() : 'Not specified'}</p>
                      <p><span className="font-semibold text-slate-900">Status:</span> {selectedItemDetails.status}</p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-600">Description</p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {selectedItemDetails.description || 'No description provided for this item.'}
                    </p>
                  </section>
                </div>

                <div className="sticky bottom-0 -mx-6 border-t border-orange-100 bg-white/95 px-6 py-4 text-right sm:-mx-8 sm:px-8">
                  <button
                    onClick={() => setShowItemDetailsModal(false)}
                    className="rounded-full border border-orange-200 bg-orange-50 px-5 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                  >
                    Close Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_34px_120px_-40px_rgba(234,88,12,0.55)]">
            <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.36),_transparent_45%),linear-gradient(125deg,_rgba(194,65,12,0.95)_0%,_rgba(234,88,12,0.94)_45%,_rgba(249,115,22,0.9)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    {editingItem ? '✎' : '📦'}
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {editingItem ? 'Update Inventory Item' : `Add Item to ${activeTab === 'raw_material' ? 'Raw Material Store' : 'Finished Goods Store'}`}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
                    Capture stock identity, controls, and pricing in one polished workspace built for daily inventory operations.
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Item Identity</p>
                    <h4 className="mt-2 text-lg font-semibold text-gray-900">Core information</h4>
                    <p className="mt-1 text-sm text-gray-500">Define item identity and classification for better store-level visibility.</p>

                    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className={modalLabelClass}>Item Name *</label>
                        <input
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className={modalInputClass}
                          placeholder="Enter item name"
                        />
                      </div>

                      <div>
                        <label className={modalLabelClass}>Item Code/SKU *</label>
                        <input
                          type="text"
                          required
                          value={formData.code}
                          onChange={(e) => {
                            setSkuManuallyEdited(true);
                            setFormData({ ...formData, code: e.target.value.toUpperCase() });
                          }}
                          className={modalInputClass}
                          placeholder="Enter unique code"
                        />
                      </div>

                      <div>
                        <label className={modalLabelClass}>Category</label>
                        <input
                          type="text"
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          className={modalInputClass}
                          placeholder="Enter category"
                          list="inventory-category-suggestions"
                        />
                        <datalist id="inventory-category-suggestions">
                          {suggestedCategories.map((category) => (
                            <option key={category} value={category} />
                          ))}
                        </datalist>
                        {activeTab === 'raw_material' && (
                          <button
                            type="button"
                            onClick={addCategorySuggestion}
                            disabled={savingCategory}
                            className="mt-2 inline-flex items-center rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingCategory ? 'Saving...' : 'Add Category'}
                          </button>
                        )}
                      </div>

                      <div>
                        <label className={modalLabelClass}>Unit *</label>
                        <select
                          required
                          value={formData.unit}
                          onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                          className={modalSelectClass}
                        >
                          <option value="">Select unit</option>
                          <option value="pieces">Pieces</option>
                          <option value="kg">Kilograms (kg)</option>
                          <option value="g">Grams (g)</option>
                          <option value="liters">Liters</option>
                          <option value="ml">Milliliters (ml)</option>
                          <option value="bags">Bags</option>
                          <option value="boxes">Boxes</option>
                          <option value="meters">Meters</option>
                          <option value="feet">Feet</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className={modalLabelClass}>Description</label>
                        <textarea
                          rows={4}
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          className={modalTextareaClass}
                          placeholder="Enter item description"
                        />
                      </div>
                    </div>
                  </section>

                  <div className="space-y-6">
                    <section className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Stock Controls</p>
                      <h4 className="mt-2 text-lg font-semibold text-gray-900">Quantities and status</h4>
                      <div className="mt-5 grid grid-cols-1 gap-4">
                        <div>
                          <label className={modalLabelClass}>Current Stock *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={formData.current_stock}
                            onChange={(e) => setFormData({ ...formData, current_stock: Number(e.target.value) || 0 })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Minimum Stock *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={formData.minimum_stock}
                            onChange={(e) => setFormData({ ...formData, minimum_stock: Number(e.target.value) || 0 })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Maximum Stock</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.maximum_stock}
                            onChange={(e) => setFormData({ ...formData, maximum_stock: Number(e.target.value) || 0 })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Status</label>
                          <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                            className={modalSelectClass}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-amber-50 to-white p-5 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">Commercial Details</p>
                      <h4 className="mt-2 text-lg font-semibold text-gray-900">Pricing and supply</h4>
                      <div className="mt-5 grid grid-cols-1 gap-4">
                        <div>
                          <label className={modalLabelClass}>Unit Price (LKR) *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            required
                            value={formData.unit_price}
                            onChange={(e) => setFormData({ ...formData, unit_price: Number(e.target.value) || 0 })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Sell Price (LKR)</label>
                          <input
                            type="text"
                            value={formData.sell_price}
                            onChange={(e) => setFormData({ ...formData, sell_price: e.target.value })}
                            className={modalInputClass}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Supplier</label>
                          <select
                            value={formData.supplier_id}
                            onChange={(e) => {
                              const selectedSupplier = suppliers.find(s => s.id.toString() === e.target.value);
                              setFormData({
                                ...formData,
                                supplier_id: e.target.value,
                                supplier_name: selectedSupplier ? selectedSupplier.name : ''
                              });
                            }}
                            className={modalSelectClass}
                          >
                            <option value="">Select supplier</option>
                            {suppliers.map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={modalLabelClass}>Location</label>
                          <input
                            type="text"
                            value={formData.location}
                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                            className={modalInputClass}
                            placeholder="Warehouse location"
                          />
                        </div>
                        <div>
                          <label className={modalLabelClass}>Expiry Date</label>
                          <input
                            type="date"
                            value={formData.expiry_date}
                            onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                            className={modalInputClass}
                          />
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end space-x-3 border-t border-orange-100 bg-white/95 px-6 py-4 sm:-mx-8 sm:px-8">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-orange-600 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : (editingItem ? 'Update Item' : 'Add Item')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">
                Delete Item
              </h3>
              <p className="text-sm text-gray-500 mt-2">
                Are you sure you want to delete this item? This action cannot be undone.
              </p>
              <div className="flex justify-center space-x-3 mt-6">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="bg-red-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}