'use client';

import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

interface PurchaseOrderItem {
  id: number;
  inventory_item: { 
    id: number; 
    name: string; 
    type: string;
    purchase_price: number;
    sell_price: number;
    expiry_date: string;
  };
  quantity: number;
  unit_price: number;
  total_price: number;
  received_quantity: number;
}

interface GrnItemForm {
  purchase_order_item_id: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  purchase_price: number;
  sell_price: number;
  expiry_date: string;
  remarks: string;
  quality_status: 'pending' | 'accepted' | 'rejected' | 'partial';
}

interface PurchaseOrder {
  id: number;
  order_number: string;
  supplier: {
    id: number;
    name: string;
    email: string;
    phone: string;
    address: string;
    contact_person: string;
    outstanding_balance?: number;
  };
  order_date: string;
  created_at?: string;
  expected_delivery_date: string | null;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  total_amount: number;
  notes: string | null;
  items: PurchaseOrderItem[];
}

interface GrnItem {
  id: number;
  received_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  purchase_price: number;
  sell_price: number;
  expiry_date: string | null;
  remarks: string;
  quality_status: 'pending' | 'accepted' | 'rejected' | 'partial';
  purchase_order_item: PurchaseOrderItem;
}

interface GRN {
  id: number;
  grn_number: string;
  purchase_order_id: number;
  received_date: string;
  notes: string | null;
  status: string;
  purchase_order: PurchaseOrder;
  grn_items: GrnItem[];
  total_amount?: number;
  discount_amount?: number;
  net_amount?: number;
  paid_amount?: number;
  payment_status?: 'unpaid' | 'partial' | 'paid';
  payment_timing?: 'post_payment' | 'on_time';
  payment_type?: string | null;
  payment_reference?: string | null;
  paid_at?: string | null;
  payment_note?: string | null;
  created_at: string;
  updated_at: string;
}

export default function GRNPage() {
  type NoticeTone = 'success' | 'error' | 'info';

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'po' | 'grn'>('po');
  const router = useRouter();
  const [token, setToken] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [selectedGrn, setSelectedGrn] = useState<GRN | null>(null);
  const [showGrnForm, setShowGrnForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPoEditModal, setShowPoEditModal] = useState(false);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [poSaving, setPoSaving] = useState(false);
  const [poEditFormData, setPoEditFormData] = useState({
    supplier_id: '',
    order_date: '',
    expected_delivery_date: '',
    status: 'pending' as 'pending' | 'approved' | 'received' | 'cancelled',
    notes: '',
  });
  const [grnFormData, setGrnFormData] = useState({
    received_date: new Date().toISOString().split('T')[0],
    notes: '',
    discount_amount: 0,
    payment_timing: 'post_payment' as 'post_payment' | 'on_time',
    payment_type: 'cash',
    paid_amount: 0,
    payment_reference: '',
    items: [] as GrnItemForm[],
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [poSearch, setPoSearch] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('all');
  const [poSupplierFilter, setPoSupplierFilter] = useState('all');
  const [poFromDate, setPoFromDate] = useState('');
  const [poToDate, setPoToDate] = useState('');
  const [grnCurrentPage, setGrnCurrentPage] = useState(1);
  const [grnPageSize] = useState(10);
  const [grnSearch, setGrnSearch] = useState('');
  const [grnStatusFilter, setGrnStatusFilter] = useState('all');
  const [grnSupplierFilter, setGrnSupplierFilter] = useState('all');
  const [grnFromDate, setGrnFromDate] = useState('');
  const [grnToDate, setGrnToDate] = useState('');
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string; tone: NoticeTone } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void> | void) | null>(null);

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
      fetchPurchaseOrders();
      fetchGRNs();
    }
  }, [token]);

  const showNotice = (title: string, message: string, tone: NoticeTone = 'info') => {
    setNoticeModal({ title, message, tone });
  };

  const openConfirm = (title: string, message: string, onConfirm: () => Promise<void> | void) => {
    setConfirmModal({ title, message });
    setConfirmAction(() => onConfirm);
  };

  const fetchPurchaseOrders = async () => {
    try {
      const response = await axios.get('/api/purchasing/purchase-orders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const orders = response.data.data || response.data || [];
      // Filter to show only approved or pending orders that can receive goods
      const receivableOrders = orders.filter((order: PurchaseOrder) =>
        order.status === 'approved' || order.status === 'pending'
      );
      // Sort by order_date descending (latest first)
      receivableOrders.sort((a: PurchaseOrder, b: PurchaseOrder) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime());
      setPurchaseOrders(receivableOrders);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchGRNs = async () => {
    try {
      const response = await axios.get('/api/purchasing/grn', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const grnData = response.data || [];
      setGrns(grnData);
    } catch (error) {
      console.error('Error fetching GRNs:', error);
      setGrns([]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'received': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const hasGrnForOrder = (orderId: number) => {
    return grns.some(grn => grn.purchase_order_id === orderId);
  };

  const getPriceRange = (order: PurchaseOrder, priceType: 'purchase' | 'sell') => {
    const prices = order.items
      .map(item => {
        const price = priceType === 'purchase' ? item.inventory_item.purchase_price : item.inventory_item.sell_price;
        return typeof price === 'number' && !isNaN(price) ? price : 0;
      })
      .filter(price => price > 0);

    if (prices.length === 0) return 'N/A';

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    if (minPrice === maxPrice) {
      return `LKR ${minPrice.toFixed(2)}`;
    } else {
      return `LKR ${minPrice.toFixed(2)} - ${maxPrice.toFixed(2)}`;
    }
  };

  const createGRN = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    // Initialize GRN form with items from the purchase order
    const grnItems: GrnItemForm[] = order.items.map(item => ({
      purchase_order_item_id: item.id,
      received_quantity: item.quantity, // Set PO quantity as default received quantity
      accepted_quantity: item.quantity, // Set PO quantity as default accepted quantity
      rejected_quantity: 0,
      purchase_price: item.inventory_item.purchase_price || 0,
      sell_price: item.inventory_item.sell_price || 0,
      expiry_date: item.inventory_item.expiry_date ? new Date(item.inventory_item.expiry_date).toISOString().split('T')[0] : '',
      remarks: '',
      quality_status: 'pending' as const,
    }));
    setGrnFormData({
      received_date: new Date().toISOString().split('T')[0],
      notes: '',
      discount_amount: 0,
      payment_timing: 'post_payment',
      payment_type: 'cash',
      paid_amount: 0,
      payment_reference: '',
      items: grnItems,
    });
    setShowGrnForm(true);
  };

  const openEditPurchaseOrder = (order: PurchaseOrder) => {
    setEditingPurchaseOrder(order);
    setPoEditFormData({
      supplier_id: String(order.supplier?.id || ''),
      order_date: order.order_date ? new Date(order.order_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      expected_delivery_date: order.expected_delivery_date ? new Date(order.expected_delivery_date).toISOString().split('T')[0] : '',
      status: order.status,
      notes: order.notes || '',
    });
    setShowPoEditModal(true);
  };

  const updatePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchaseOrder) return;

    try {
      setPoSaving(true);
      await axios.put(
        `/api/purchasing/purchase-orders/${editingPurchaseOrder.id}`,
        {
          supplier_id: Number(poEditFormData.supplier_id),
          order_date: poEditFormData.order_date,
          expected_delivery_date: poEditFormData.expected_delivery_date || null,
          status: poEditFormData.status,
          notes: poEditFormData.notes,
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setShowPoEditModal(false);
      setEditingPurchaseOrder(null);
      fetchPurchaseOrders();
      fetchGRNs();
    } catch (error: any) {
      console.error('Error updating purchase order:', error);
      showNotice('Update Failed', error?.response?.data?.message || 'Failed to update purchase order.', 'error');
    } finally {
      setPoSaving(false);
    }
  };

  const removePurchaseOrder = async (order: PurchaseOrder) => {
    if (hasGrnForOrder(order.id)) {
      showNotice('Cannot Delete', 'Cannot delete a purchase order that already has a GRN.', 'info');
      return;
    }

    openConfirm('Delete Purchase Order', `Delete purchase order ${order.order_number}?`, async () => {
      try {
        await axios.delete(`/api/purchasing/purchase-orders/${order.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        fetchPurchaseOrders();
        fetchGRNs();
        showNotice('Deleted', 'Purchase order deleted successfully.', 'success');
      } catch (error: any) {
        console.error('Error deleting purchase order:', error);
        showNotice('Delete Failed', error?.response?.data?.message || 'Failed to delete purchase order.', 'error');
      }
    });
  };

  const editGRN = (grn: GRN) => {
    setSelectedGrn(grn);
    setSelectedOrder(grn.purchase_order);
    setIsEditing(true);

    // Initialize GRN form with existing data
    const grnItems: GrnItemForm[] = grn.grn_items.map(item => ({
      purchase_order_item_id: item.purchase_order_item.id,
      received_quantity: item.received_quantity,
      accepted_quantity: item.accepted_quantity,
      rejected_quantity: item.rejected_quantity,
      purchase_price: item.purchase_price,
      sell_price: item.sell_price,
      expiry_date: item.expiry_date ? new Date(item.expiry_date).toISOString().split('T')[0] : '',
      remarks: item.remarks,
      quality_status: item.quality_status,
    }));

    setGrnFormData({
      received_date: new Date(grn.received_date).toISOString().split('T')[0],
      notes: grn.notes || '',
      discount_amount: Number(grn.discount_amount || 0),
      payment_timing: grn.payment_timing || 'post_payment',
      payment_type: grn.payment_type || 'cash',
      paid_amount: Number(grn.paid_amount || 0),
      payment_reference: grn.payment_reference || '',
      items: grnItems,
    });
    setShowGrnForm(true);
  };

  const submitGRN = async (grnData: any) => {
    try {
      const response = await axios.post('/api/purchasing/grn', grnData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showNotice('GRN Created', 'GRN created successfully!', 'success');
      setShowGrnForm(false);
      setSelectedOrder(null);
      setIsEditing(false);
      setCurrentPage(1); // Reset to first page
      // Refresh both lists
      fetchPurchaseOrders();
      fetchGRNs();
      return response.data;
    } catch (error: any) {
      console.error('Error creating GRN:', error);
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      showNotice('Create Failed', firstError?.[0] || error?.response?.data?.message || 'Failed to create GRN. Please try again.', 'error');
      throw error;
    }
  };

  const updateGRN = async (grnData: any) => {
    try {
      const response = await axios.put(`/api/purchasing/grn/${selectedGrn?.id}`, grnData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showNotice('GRN Updated', 'GRN updated successfully!', 'success');
      setShowGrnForm(false);
      setSelectedGrn(null);
      setSelectedOrder(null);
      setIsEditing(false);
      setCurrentPage(1); // Reset to first page
      // Refresh both lists
      fetchPurchaseOrders();
      fetchGRNs();
      return response.data;
    } catch (error: any) {
      console.error('Error updating GRN:', error);
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      showNotice('Update Failed', firstError?.[0] || error?.response?.data?.message || 'Failed to update GRN. Please try again.', 'error');
      throw error;
    }
  };

  const deleteGRN = async (grnId: number) => {
    openConfirm(
      'Delete GRN',
      'Are you sure you want to delete this GRN? This will reverse the inventory stock adjustments.',
      async () => {
        try {
          await axios.delete(`/api/purchasing/grn/${grnId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          showNotice('GRN Deleted', 'GRN deleted successfully!', 'success');
          setCurrentPage(1); // Reset to first page
          fetchGRNs();
          fetchPurchaseOrders();
        } catch (error) {
          console.error('Error deleting GRN:', error);
          showNotice('Delete Failed', 'Failed to delete GRN. Please try again.', 'error');
        }
      }
    );
  };
  const updateGrnItem = (index: number, field: keyof GrnItemForm, value: any) => {
    const updatedItems = [...grnFormData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setGrnFormData({ ...grnFormData, items: updatedItems });
  };

  const updateRejectedQuantity = (index: number, rejectedValue: number) => {
    const updatedItems = [...grnFormData.items];
    const receivedQuantity = updatedItems[index]?.received_quantity || 0;
    const acceptedQuantity = Math.max(0, receivedQuantity - rejectedValue); // Ensure accepted quantity is not negative

    updatedItems[index] = {
      ...updatedItems[index],
      rejected_quantity: rejectedValue,
      accepted_quantity: acceptedQuantity
    };
    setGrnFormData({ ...grnFormData, items: updatedItems });
  };

  const updateReceivedQuantity = (index: number, receivedValue: number) => {
    const updatedItems = [...grnFormData.items];
    const rejectedQuantity = updatedItems[index]?.rejected_quantity || 0;
    const acceptedQuantity = Math.max(0, receivedValue - rejectedQuantity); // Ensure accepted quantity is not negative

    updatedItems[index] = {
      ...updatedItems[index],
      received_quantity: receivedValue,
      accepted_quantity: acceptedQuantity
    };
    setGrnFormData({ ...grnFormData, items: updatedItems });
  };

  const grnTotalAmount = useMemo(() => {
    if (!selectedOrder) return 0;

    return grnFormData.items.reduce((sum, item) => {
      const acceptedQty = Number(item.accepted_quantity || 0);
      if (acceptedQty <= 0) return sum;

      const fallbackPrice = Number(
        selectedOrder.items.find((orderItem) => orderItem.id === item.purchase_order_item_id)?.unit_price || 0
      );
      const purchasePrice = Number(item.purchase_price ?? fallbackPrice);
      return sum + acceptedQty * Math.max(purchasePrice, 0);
    }, 0);
  }, [grnFormData.items, selectedOrder]);

  const grnDiscountAmount = Math.min(
    Math.max(Number(grnFormData.discount_amount || 0), 0),
    Number(grnTotalAmount || 0)
  );
  const grnNetAmount = Math.max(Number(grnTotalAmount || 0) - grnDiscountAmount, 0);
  const onTimePaidPreview = Math.min(Math.max(Number(grnFormData.paid_amount || 0), 0), Number(grnNetAmount || 0));
  const grnPendingAmount = grnFormData.payment_timing === 'on_time'
    ? Math.max(Number(grnNetAmount || 0) - onTimePaidPreview, 0)
    : Number(grnNetAmount || 0);
  const currentSupplierOutstanding = Number(selectedOrder?.supplier?.outstanding_balance || 0);
  const projectedSupplierOutstanding = Math.max(currentSupplierOutstanding + grnPendingAmount, 0);

  const handleGrnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    const onTimePaidAmount = Math.min(Math.max(Number(grnFormData.paid_amount || 0), 0), Number(grnNetAmount || 0));

    if (grnFormData.payment_timing === 'on_time') {
      if (!grnFormData.payment_type) {
        showNotice('Validation', 'Select a payment type for on-time payment.', 'info');
        return;
      }
      if (onTimePaidAmount <= 0) {
        showNotice('Validation', 'Enter paid amount for on-time payment.', 'info');
        return;
      }
      if (!String(grnFormData.payment_reference || '').trim()) {
        showNotice('Validation', 'Enter payment reference for on-time payment.', 'info');
        return;
      }
    }

    // Prepare data for submission, converting empty strings to null
    const submitData = {
      purchase_order_id: selectedOrder.id,
      received_date: grnFormData.received_date,
      notes: grnFormData.notes,
      discount_amount: Number(grnDiscountAmount.toFixed(2)),
      payment_timing: grnFormData.payment_timing,
      payment_type: grnFormData.payment_timing === 'on_time' ? grnFormData.payment_type : null,
      paid_amount: grnFormData.payment_timing === 'on_time' ? Number(onTimePaidAmount.toFixed(2)) : 0,
      payment_reference: grnFormData.payment_timing === 'on_time' ? String(grnFormData.payment_reference || '').trim() : null,
      items: grnFormData.items.map(item => ({
        ...item,
        expiry_date: item.expiry_date || null, // Convert empty string to null
      })),
    };

    if (isEditing) {
      await updateGRN(submitData);
    } else {
      await submitGRN(submitData);
    }
  };

  const poSuppliers = useMemo(() => {
    const names = Array.from(
      new Set(
        purchaseOrders
          .map((order) => String(order.supplier?.name || '').trim())
          .filter((name) => name.length > 0)
      )
    );

    return names.sort((a, b) => a.localeCompare(b));
  }, [purchaseOrders]);

  const filteredPurchaseOrders = useMemo(() => {
    const term = poSearch.trim().toLowerCase();

    const filtered = purchaseOrders.filter((order) => {
      const orderDate = String(order.order_date || '').slice(0, 10);
      const supplierName = String(order.supplier?.name || '');

      const matchesSearch = !term || [
        order.order_number,
        supplierName,
        order.supplier?.email,
        order.supplier?.phone,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));

      const matchesStatus = poStatusFilter === 'all' || String(order.status || '').toLowerCase() === poStatusFilter;
      const matchesSupplier = poSupplierFilter === 'all' || supplierName === poSupplierFilter;
      const matchesFromDate = !poFromDate || orderDate >= poFromDate;
      const matchesToDate = !poToDate || orderDate <= poToDate;

      return matchesSearch && matchesStatus && matchesSupplier && matchesFromDate && matchesToDate;
    });

    return filtered.sort((a, b) => {
      const dateA = new Date(a.created_at || a.order_date).getTime();
      const dateB = new Date(b.created_at || b.order_date).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return b.id - a.id;
    });
  }, [purchaseOrders, poSearch, poStatusFilter, poSupplierFilter, poFromDate, poToDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [poSearch, poStatusFilter, poSupplierFilter, poFromDate, poToDate]);

  // Pagination logic
  const totalPages = Math.ceil(filteredPurchaseOrders.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedOrders = filteredPurchaseOrders.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const grnSuppliers = useMemo(() => {
    const names = Array.from(
      new Set(
        grns
          .map((grn) => String(grn.purchase_order?.supplier?.name || '').trim())
          .filter((name) => name.length > 0)
      )
    );

    return names.sort((a, b) => a.localeCompare(b));
  }, [grns]);

  const filteredGrns = useMemo(() => {
    const term = grnSearch.trim().toLowerCase();

    return grns.filter((grn) => {
      const receivedDate = String(grn.received_date || '').slice(0, 10);
      const supplierName = String(grn.purchase_order?.supplier?.name || '');

      const matchesSearch = !term || [
        grn.grn_number,
        grn.purchase_order?.order_number,
        supplierName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));

      const matchesStatus = grnStatusFilter === 'all' || String(grn.status || '').toLowerCase() === grnStatusFilter;
      const matchesSupplier = grnSupplierFilter === 'all' || supplierName === grnSupplierFilter;
      const matchesFromDate = !grnFromDate || receivedDate >= grnFromDate;
      const matchesToDate = !grnToDate || receivedDate <= grnToDate;

      return matchesSearch && matchesStatus && matchesSupplier && matchesFromDate && matchesToDate;
    });
  }, [grns, grnSearch, grnStatusFilter, grnSupplierFilter, grnFromDate, grnToDate]);

  const grnTotalPages = Math.max(1, Math.ceil(filteredGrns.length / grnPageSize));
  const grnStartIndex = (grnCurrentPage - 1) * grnPageSize;
  const grnEndIndex = grnStartIndex + grnPageSize;
  const paginatedGrns = filteredGrns.slice(grnStartIndex, grnEndIndex);

  useEffect(() => {
    setGrnCurrentPage(1);
  }, [grnSearch, grnStatusFilter, grnSupplierFilter, grnFromDate, grnToDate]);

  useEffect(() => {
    if (grnCurrentPage > grnTotalPages) {
      setGrnCurrentPage(grnTotalPages);
    }
  }, [grnCurrentPage, grnTotalPages]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Purchase Orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Goods Received Notes (GRN)</h1>
              <p className="mt-2 text-gray-600">
                Manage purchase orders and goods received notes.
              </p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to Purchasing
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setCurrentView('po')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'po'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Purchase Orders
              </button>
              <button
                onClick={() => setCurrentView('grn')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'grn'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                GRN Records ({filteredGrns.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Purchase Orders View */}
        {currentView === 'po' && (
          <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_60px_-30px_rgba(30,64,175,0.35)]">
            <div className="border-b border-blue-100 bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 px-6 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">Available Purchase Orders</h2>
                  <p className="mt-1 text-sm text-blue-100/85">
                    Purchase orders that are approved or pending and can receive goods.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/90">
                  <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                  {filteredPurchaseOrders.length} of {purchaseOrders.length} receivable orders
                </div>
              </div>
            </div>

            {purchaseOrders.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mb-4 text-6xl text-gray-400">📦</div>
                <h3 className="mb-2 text-lg font-medium text-gray-900">No Purchase Orders Available</h3>
                <p className="mb-4 text-gray-600">
                  There are no approved or pending purchase orders that can receive goods.
                </p>
                <button
                  onClick={() => router.push('/dashboard/purchasing/purchase-orders')}
                  className="inline-flex items-center rounded-full border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Create Purchase Order
                </button>
              </div>
            ) : (
              <>
                <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50/90 via-cyan-50/70 to-slate-50 px-6 py-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</label>
                      <input
                        type="text"
                        value={poSearch}
                        onChange={(e) => setPoSearch(e.target.value)}
                        placeholder="PO #, supplier, email, phone"
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</label>
                      <select
                        value={poStatusFilter}
                        onChange={(e) => setPoStatusFilter(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="received">Received</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Supplier</label>
                      <select
                        value={poSupplierFilter}
                        onChange={(e) => setPoSupplierFilter(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="all">All Suppliers</option>
                        {poSuppliers.map((supplierName) => (
                          <option key={supplierName} value={supplierName}>{supplierName}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">From Date</label>
                      <input
                        type="date"
                        value={poFromDate}
                        onChange={(e) => setPoFromDate(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">To Date</label>
                      <input
                        type="date"
                        value={poToDate}
                        onChange={(e) => setPoToDate(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto bg-gradient-to-b from-white to-slate-50/60">
                  <table className="min-w-full divide-y divide-slate-200/80">
                    <thead className="bg-slate-100/80">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Order #
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Supplier
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Order Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Expected Delivery
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Purchase Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Sell Price
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Total Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Items
                        </th>
                        <th className="relative px-6 py-3">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 bg-white">
                      {paginatedOrders.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-6 py-8 text-center text-sm text-slate-500">
                            No purchase orders found for selected filters.
                          </td>
                        </tr>
                      ) : (
                      paginatedOrders.map((order) => (
                        <tr key={order.id} className="transition hover:bg-blue-50/40">
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                              {order.order_number}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-xs font-bold text-white">
                                {order.supplier.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-800">{order.supplier.name}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                            {new Date(order.created_at || order.order_date).toLocaleString()}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                            {order.expected_delivery_date
                              ? new Date(order.expected_delivery_date).toLocaleDateString()
                              : 'Not specified'
                            }
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                            {getPriceRange(order, 'purchase')}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                            {getPriceRange(order, 'sell')}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-800">
                            LKR {parseFloat(order.total_amount.toString()).toFixed(2)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              {order.items.length} items
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => openEditPurchaseOrder(order)}
                                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                              >
                                Edit PO
                              </button>
                              <button
                                onClick={() => removePurchaseOrder(order)}
                                disabled={hasGrnForOrder(order.id)}
                                className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Delete PO
                              </button>
                              {hasGrnForOrder(order.id) ? (
                                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                  GRN Created
                                </span>
                              ) : (
                                <button
                                  onClick={() => createGRN(order)}
                                  className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600"
                                >
                                  Create GRN
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {filteredPurchaseOrders.length > 0 && totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                    <div className="flex flex-1 justify-between sm:hidden">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="relative ml-3 inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-slate-700">
                          Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                          <span className="font-medium">{Math.min(endIndex, filteredPurchaseOrders.length)}</span> of{' '}
                          <span className="font-medium">{filteredPurchaseOrders.length}</span> results
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex -space-x-px overflow-hidden rounded-xl border border-slate-200 shadow-sm" aria-label="Pagination">
                          <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="relative inline-flex items-center border-r border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="sr-only">Previous</span>
                            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                              key={page}
                              onClick={() => handlePageChange(page)}
                              className={`relative inline-flex items-center border-r border-slate-200 px-4 py-2 text-sm font-medium ${
                                page === currentPage
                                  ? 'z-10 bg-blue-600 text-white'
                                  : 'bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                          <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="relative inline-flex items-center bg-white px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="sr-only">Next</span>
                            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* GRN Records View */}
        {currentView === 'grn' && (
          <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_60px_-30px_rgba(30,64,175,0.35)]">
            <div className="border-b border-blue-100 bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 px-6 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">GRN Records</h2>
                  <p className="mt-1 text-sm text-blue-100/85">
                    View and manage existing Goods Received Notes.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white/90">
                  <span className="h-2 w-2 rounded-full bg-cyan-300"></span>
                  {filteredGrns.length} filtered records
                </div>
              </div>
            </div>

            {grns.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mb-4 text-6xl text-gray-400">📋</div>
                <h3 className="mb-2 text-lg font-medium text-gray-900">No GRN Records</h3>
                <p className="mb-4 text-gray-600">
                View and manage existing Goods Received Notes.
                </p>
                <button
                  onClick={() => setCurrentView('po')}
                  className="inline-flex items-center rounded-full border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Create First GRN
                </button>
              </div>
            ) : (
              <>
                <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50/90 via-cyan-50/70 to-slate-50 px-6 py-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
                    <div className="lg:col-span-2">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</label>
                      <input
                        type="text"
                        value={grnSearch}
                        onChange={(e) => setGrnSearch(e.target.value)}
                        placeholder="GRN #, PO #, supplier"
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</label>
                      <select
                        value={grnStatusFilter}
                        onChange={(e) => setGrnStatusFilter(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="received">Received</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Supplier</label>
                      <select
                        value={grnSupplierFilter}
                        onChange={(e) => setGrnSupplierFilter(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="all">All Suppliers</option>
                        {grnSuppliers.map((supplierName) => (
                          <option key={supplierName} value={supplierName}>{supplierName}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">From Date</label>
                      <input
                        type="date"
                        value={grnFromDate}
                        onChange={(e) => setGrnFromDate(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">To Date</label>
                      <input
                        type="date"
                        value={grnToDate}
                        onChange={(e) => setGrnToDate(e.target.value)}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto bg-gradient-to-b from-white to-slate-50/60">
                <table className="min-w-full divide-y divide-slate-200/80">
                  <thead className="bg-slate-100/80">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        GRN #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        PO #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Supplier
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Received Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Net Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Payment
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Payment Option
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Items
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Total Accepted
                      </th>
                      <th className="relative px-6 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 bg-white">
                    {paginatedGrns.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-6 py-8 text-center text-sm text-slate-500">
                          No GRN records found for selected filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedGrns.map((grn) => (
                        <tr key={grn.id} className="transition hover:bg-blue-50/40">
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                              {grn.grn_number}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">
                            {grn.purchase_order.order_number}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">
                            {grn.purchase_order.supplier.name}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                            {new Date(grn.received_date).toLocaleDateString()}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusColor(grn.status)}`}>
                              {grn.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-800">
                            LKR {Number(grn.net_amount || 0).toFixed(2)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                              grn.payment_status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700'
                                : grn.payment_status === 'partial'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              {grn.payment_status || 'unpaid'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                            <div className="space-y-1">
                              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                grn.payment_timing === 'on_time'
                                  ? 'bg-cyan-100 text-cyan-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {grn.payment_timing === 'on_time' ? 'On-time' : 'Post'}
                              </span>
                              {grn.payment_timing === 'on_time' && (
                                <p className="text-xs text-slate-500">
                                  {grn.payment_type || '-'} • {grn.payment_reference || '-'}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              {grn.grn_items.length} items
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-800">
                            {Number(grn.grn_items.reduce((sum, item) => sum + (Number(item.accepted_quantity) || 0), 0)).toFixed(2)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => editGRN(grn)}
                                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteGRN(grn.id)}
                                className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
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

                {filteredGrns.length > 0 && (
                  <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                    <div className="flex flex-1 justify-between sm:hidden">
                      <button
                        onClick={() => setGrnCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={grnCurrentPage === 1}
                        className="relative inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setGrnCurrentPage((prev) => Math.min(grnTotalPages, prev + 1))}
                        disabled={grnCurrentPage === grnTotalPages}
                        className="relative ml-3 inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>

                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-700">
                        Showing <span className="font-medium">{grnStartIndex + 1}</span> to{' '}
                        <span className="font-medium">{Math.min(grnEndIndex, filteredGrns.length)}</span> of{' '}
                        <span className="font-medium">{filteredGrns.length}</span> GRN records
                      </p>

                      <nav className="relative z-0 inline-flex -space-x-px overflow-hidden rounded-xl border border-slate-200 shadow-sm" aria-label="GRN Pagination">
                        <button
                          onClick={() => setGrnCurrentPage((prev) => Math.max(1, prev - 1))}
                          disabled={grnCurrentPage === 1}
                          className="relative inline-flex items-center border-r border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="sr-only">Previous</span>
                          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>

                        {Array.from({ length: grnTotalPages }, (_, i) => i + 1).map((page) => (
                          <button
                            key={page}
                            onClick={() => setGrnCurrentPage(page)}
                            className={`relative inline-flex items-center border-r border-slate-200 px-4 py-2 text-sm font-medium ${
                              page === grnCurrentPage
                                ? 'z-10 bg-blue-600 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {page}
                          </button>
                        ))}

                        <button
                          onClick={() => setGrnCurrentPage((prev) => Math.min(grnTotalPages, prev + 1))}
                          disabled={grnCurrentPage === grnTotalPages}
                          className="relative inline-flex items-center bg-white px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="sr-only">Next</span>
                          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </nav>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Purchase Order Edit Modal */}
      {showPoEditModal && editingPurchaseOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl">
            <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Edit Purchase Order</h3>
              <p className="text-sm text-slate-600">{editingPurchaseOrder.order_number}</p>
            </div>

            <form onSubmit={updatePurchaseOrder} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Supplier</label>
                  <select
                    value={poEditFormData.supplier_id}
                    onChange={(e) => setPoEditFormData({ ...poEditFormData, supplier_id: e.target.value })}
                    className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    required
                  >
                    <option value="">Select Supplier</option>
                    {Array.isArray((purchaseOrders || [])) &&
                      Array.from(new Map(purchaseOrders.map((po) => [po.supplier.id, po.supplier])).values()).map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                  <select
                    value={poEditFormData.status}
                    onChange={(e) => setPoEditFormData({ ...poEditFormData, status: e.target.value as 'pending' | 'approved' | 'received' | 'cancelled' })}
                    className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    required
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="received">Received</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Order Date</label>
                  <input
                    type="date"
                    value={poEditFormData.order_date}
                    onChange={(e) => setPoEditFormData({ ...poEditFormData, order_date: e.target.value })}
                    className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Expected Delivery</label>
                  <input
                    type="date"
                    value={poEditFormData.expected_delivery_date}
                    onChange={(e) => setPoEditFormData({ ...poEditFormData, expected_delivery_date: e.target.value })}
                    className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                <textarea
                  rows={3}
                  value={poEditFormData.notes}
                  onChange={(e) => setPoEditFormData({ ...poEditFormData, notes: e.target.value })}
                  className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPoEditModal(false);
                    setEditingPurchaseOrder(null);
                  }}
                  className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={poSaving}
                  className="rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2 text-sm font-semibold text-white transition hover:from-blue-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {poSaving ? 'Saving...' : 'Update Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notice Modal */}
      {noticeModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${
                noticeModal.tone === 'success'
                  ? 'bg-emerald-500'
                  : noticeModal.tone === 'error'
                  ? 'bg-red-500'
                  : 'bg-blue-500'
              }`}>
                {noticeModal.tone === 'success' ? '✓' : noticeModal.tone === 'error' ? '!' : 'i'}
              </div>
              <h4 className="text-lg font-semibold text-slate-900">{noticeModal.title}</h4>
            </div>
            <p className="text-sm text-slate-600">{noticeModal.message}</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setNoticeModal(null)}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">?</div>
              <h4 className="text-lg font-semibold text-slate-900">{confirmModal.title}</h4>
            </div>
            <p className="text-sm text-slate-600">{confirmModal.message}</p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setConfirmModal(null);
                  setConfirmAction(null);
                }}
                className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (confirmAction) {
                    await confirmAction();
                  }
                  setConfirmModal(null);
                  setConfirmAction(null);
                }}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GRN Form Modal */}
      {showGrnForm && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-[1180px] overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_36px_120px_-45px_rgba(29,78,216,0.55)]">
            <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.3),_transparent_45%),linear-gradient(125deg,_rgba(15,23,42,0.95)_0%,_rgba(30,64,175,0.94)_45%,_rgba(14,116,144,0.9)_100%)]"></div>
            <div className="relative max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    {isEditing ? '✎' : '📥'}
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {isEditing ? 'Edit' : 'Create'} Goods Received Note
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
                    PO {selectedOrder?.order_number} • Capture received quantities, pricing adjustments and quality checks in one guided flow.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowGrnForm(false);
                    setIsEditing(false);
                    setSelectedGrn(null);
                    setSelectedOrder(null);
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              <form onSubmit={handleGrnSubmit} className="px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-500">Receiving Details</p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Received Date</label>
                      <input
                        type="date"
                        value={grnFormData.received_date}
                        onChange={(e) => setGrnFormData({ ...grnFormData, received_date: e.target.value })}
                        className="w-full rounded-xl border border-blue-100 bg-gradient-to-b from-white to-blue-50/30 px-3.5 py-2.5 text-sm text-black shadow-sm transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                      <textarea
                        value={grnFormData.notes}
                        onChange={(e) => setGrnFormData({ ...grnFormData, notes: e.target.value })}
                        className="w-full rounded-xl border border-blue-100 bg-gradient-to-b from-white to-blue-50/30 px-3.5 py-2.5 text-sm text-black shadow-sm transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        rows={3}
                        placeholder="Optional notes about the received goods"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-800">Received Items</h4>
                      <p className="mt-1 text-sm text-gray-500">Verify quantities, set quality status and adjust pricing where needed.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                      {selectedOrder.items.length} line items
                    </span>
                  </div>

                  <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50/80 p-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-blue-800">
                          <strong>Auto-filled quantities:</strong> Received and Accepted quantities are pre-filled with PO quantities. Adjust rejected quantity to automatically recalculate accepted quantity.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-100/80">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Item</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">PO Qty</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Purchase Price</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sell Price</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Expiry Date</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Received Qty</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Accepted Qty
                            <span className="mt-1 block text-[11px] normal-case tracking-normal text-blue-600 font-medium">Auto-calculated</span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Rejected Qty</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quality Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {selectedOrder.items.map((orderItem, index) => (
                          <tr key={orderItem.id} className="transition hover:bg-blue-50/40">
                            <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-900">
                              {orderItem.inventory_item.name}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-blue-700">
                              {orderItem.quantity}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <div className="flex items-center">
                                <span className="mr-1 text-gray-500">LKR</span>
                                <input
                                  type="number"
                                  value={grnFormData.items[index]?.purchase_price || 0}
                                  onChange={(e) => updateGrnItem(index, 'purchase_price', parseFloat(e.target.value) || 0)}
                                  className="w-24 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <div className="flex items-center">
                                <span className="mr-1 text-gray-500">LKR</span>
                                <input
                                  type="number"
                                  value={grnFormData.items[index]?.sell_price || 0}
                                  onChange={(e) => updateGrnItem(index, 'sell_price', parseFloat(e.target.value) || 0)}
                                  className="w-24 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                  min="0"
                                  step="0.01"
                                />
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <input
                                type="date"
                                value={grnFormData.items[index]?.expiry_date || ''}
                                onChange={(e) => updateGrnItem(index, 'expiry_date', e.target.value)}
                                className="w-36 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <input
                                type="number"
                                value={grnFormData.items[index]?.received_quantity || 0}
                                onChange={(e) => updateReceivedQuantity(index, parseFloat(e.target.value) || 0)}
                                className="w-24 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                min="0"
                                step="0.01"
                                required
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <input
                                type="number"
                                value={grnFormData.items[index]?.accepted_quantity || 0}
                                readOnly
                                className="w-24 cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-black"
                                min="0"
                                step="0.01"
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <input
                                type="number"
                                value={grnFormData.items[index]?.rejected_quantity || 0}
                                onChange={(e) => updateRejectedQuantity(index, parseFloat(e.target.value) || 0)}
                                className="w-24 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                min="0"
                                step="0.01"
                              />
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <select
                                value={grnFormData.items[index]?.quality_status || 'pending'}
                                onChange={(e) => updateGrnItem(index, 'quality_status', e.target.value)}
                                className="w-36 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                              >
                                <option value="pending">Pending</option>
                                <option value="accepted">Accepted</option>
                                <option value="rejected">Rejected</option>
                                <option value="partial">Partial</option>
                              </select>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <input
                                type="text"
                                value={grnFormData.items[index]?.remarks || ''}
                                onChange={(e) => updateGrnItem(index, 'remarks', e.target.value)}
                                className="w-40 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                placeholder="Remarks"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <h4 className="text-lg font-semibold text-slate-800">Payment Details</h4>
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Before submit
                    </span>
                  </div>
                  <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Payment Option</label>
                      <select
                        value={grnFormData.payment_timing}
                        onChange={(e) => {
                          const timing = e.target.value as 'post_payment' | 'on_time';
                          setGrnFormData({
                            ...grnFormData,
                            payment_timing: timing,
                            paid_amount: timing === 'on_time' ? grnFormData.paid_amount : 0,
                            payment_reference: timing === 'on_time' ? grnFormData.payment_reference : '',
                          });
                        }}
                        className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="post_payment">Post Payment (pay later in Accounts)</option>
                        <option value="on_time">On-time Payment (pay now with GRN)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Payment Status Preview</label>
                      <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800">
                        {grnFormData.payment_timing === 'post_payment' ? 'Will appear in Accounts GRN Payment Control' : 'Will save as on-time payment in this GRN'}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Total GRN Amount</label>
                      <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800">
                        LKR {Number(grnTotalAmount || 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Discount</label>
                      <div className="flex items-center">
                        <span className="mr-2 text-sm text-gray-500">LKR</span>
                        <input
                          type="number"
                          value={grnFormData.discount_amount}
                          onChange={(e) => setGrnFormData({ ...grnFormData, discount_amount: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                          min="0"
                          max={Number(grnTotalAmount || 0)}
                          step="0.01"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Net Amount</label>
                      <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800">
                        LKR {Number(grnNetAmount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {grnFormData.payment_timing === 'on_time' && (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Pay Type</label>
                        <select
                          value={grnFormData.payment_type}
                          onChange={(e) => setGrnFormData({ ...grnFormData, payment_type: e.target.value })}
                          className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                        >
                          <option value="cash">Cash</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="cheque">Cheque</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Pay Amount</label>
                        <div className="flex items-center">
                          <span className="mr-2 text-sm text-gray-500">LKR</span>
                          <input
                            type="number"
                            value={grnFormData.paid_amount}
                            onChange={(e) => setGrnFormData({ ...grnFormData, paid_amount: parseFloat(e.target.value) || 0 })}
                            className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                            min="0"
                            max={Number(grnNetAmount || 0)}
                            step="0.01"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Reference</label>
                        <input
                          type="text"
                          value={grnFormData.payment_reference}
                          onChange={(e) => setGrnFormData({ ...grnFormData, payment_reference: e.target.value })}
                          className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm text-black shadow-sm transition-all duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100"
                          placeholder="Txn ID / Cheque # / Ref"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Supplier Outstanding Impact</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-amber-900 md:grid-cols-3">
                      <p>Current: <span className="font-semibold">LKR {currentSupplierOutstanding.toFixed(2)}</span></p>
                      <p>Added by this GRN: <span className="font-semibold">LKR {grnPendingAmount.toFixed(2)}</span></p>
                      <p>Projected: <span className="font-semibold">LKR {projectedSupplierOutstanding.toFixed(2)}</span></p>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end space-x-3 border-t border-blue-100 bg-white/95 px-6 py-4 sm:-mx-8 sm:px-8">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGrnForm(false);
                      setIsEditing(false);
                      setSelectedGrn(null);
                      setSelectedOrder(null);
                    }}
                    className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-emerald-600 hover:to-teal-600"
                  >
                    {isEditing ? 'Update' : 'Create'} GRN
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