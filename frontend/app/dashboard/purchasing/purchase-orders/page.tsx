'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

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
  };
  order_date: string;
  created_at?: string;
  expected_delivery_date: string | null;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  total_amount: number;
  notes: string | null;
  items: PurchaseOrderItem[];
}

interface PurchaseOrderItem {
  id: number;
  inventory_item: { id: number; name: string; type: string };
  quantity: number;
  unit_price: number;
  total_price: number;
  received_quantity: number;
}

interface Supplier {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  contact_person: string;
}

interface InventoryItem {
  id: number;
  name: string;
  code: string;
  type: 'raw_material' | 'finished_product' | 'office_asset';
  category: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  unit_price: number;
  supplier_name: string;
}

interface OrderItem {
  inventory_item_id: number;
  item_name: string;
  item_code: string;
  item_unit: string;
  unit_price: number;
  quantity: number;
}

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const router = useRouter();
  const [token, setToken] = useState('');
  const [formData, setFormData] = useState({
    supplier_id: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    notes: '',
    items: [] as OrderItem[],
  });

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
      fetchSuppliers();
      fetchInventoryItems();
    }
  }, [token]);

  const fetchPurchaseOrders = async () => {
    try {
      const response = await axios.get('/api/purchasing/purchase-orders', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPurchaseOrders(response.data.data || response.data || []);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await axios.get('/api/stock/suppliers', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 100 }
      });
      if (response.data.success) {
        const suppliersData = response.data.data.data || response.data.data || [];
        setSuppliers(suppliersData);
      } else {
        console.error('Failed to fetch suppliers:', response.data.message);
        setSuppliers([]);
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      setSuppliers([]);
    }
  };

  const fetchInventoryItems = async () => {
    try {
      const response = await axios.get('/api/stock/inventory', {
        headers: { Authorization: `Bearer ${token}` },
        params: { per_page: 100 }
      });
      if (response.data.success) {
        const itemsData = response.data.data.data || [];
        setInventoryItems(itemsData);
      } else {
        console.error('Failed to fetch inventory items:', response.data.message);
        setInventoryItems([]);
      }
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      setInventoryItems([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.items.length === 0) {
      alert('Please add at least one order item.');
      return;
    }

    const invalidIndex = formData.items.findIndex((item) => {
      const hasSelectedItem = Number(item.inventory_item_id) > 0;
      const hasTypedItem = item.item_name.trim().length > 0;
      return !hasSelectedItem && !hasTypedItem;
    });

    if (invalidIndex >= 0) {
      alert(`Item ${invalidIndex + 1}: select an available stock item or type a new item name.`);
      return;
    }

    try {
      await axios.post('/api/purchasing/purchase-orders', {
        ...formData,
        supplier_id: Number(formData.supplier_id),
        items: formData.items.map((item) => ({
          inventory_item_id: item.inventory_item_id || null,
          item_name: item.item_name.trim() || null,
          item_code: item.item_code.trim() || null,
          item_unit: item.item_unit.trim() || null,
          unit_price: Number(item.unit_price) || 0,
          quantity: Number(item.quantity) || 0,
        })),
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowForm(false);
      setFormData({
        supplier_id: '',
        order_date: new Date().toISOString().split('T')[0],
        expected_delivery_date: '',
        notes: '',
        items: [],
      });
      fetchPurchaseOrders();
    } catch (error: any) {
      console.error('Error creating purchase order:', error);
      const firstError = Object.values(error?.response?.data?.errors || {})?.[0] as string[] | undefined;
      alert(firstError?.[0] || error?.response?.data?.message || 'Failed to create purchase order.');
    }
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { inventory_item_id: 0, item_name: '', item_code: '', item_unit: 'pieces', unit_price: 0, quantity: 1 }],
    });
  };

  const updateItem = (index: number, field: keyof OrderItem, value: any) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setFormData({ ...formData, items: updatedItems });
  };

  const removeItem = (index: number) => {
    const updatedItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: updatedItems });
  };

  const handleInventorySelect = (index: number, rawValue: string) => {
    const inventoryItemId = parseInt(rawValue, 10) || 0;
    const selected = inventoryItems.find((inv) => inv.id === inventoryItemId);

    if (selected) {
      const updatedItems = [...formData.items];
      updatedItems[index] = {
        ...updatedItems[index],
        inventory_item_id: selected.id,
        item_name: selected.name,
        item_code: selected.code,
        item_unit: selected.unit || 'pieces',
        unit_price: Number(selected.unit_price) || 0,
      };
      setFormData({ ...formData, items: updatedItems });
      return;
    }

    updateItem(index, 'inventory_item_id', 0);
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

  const viewOrder = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  const printOrder = (order: PurchaseOrder) => {
    setSelectedOrder(order);
    setShowPrintModal(true);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  const modalLabelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-600';
  const modalInputClass = 'mt-1.5 block w-full rounded-xl border border-blue-100 bg-gradient-to-b from-white to-blue-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 placeholder:text-gray-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 focus:outline-none';
  const modalSelectClass = 'mt-1.5 block w-full rounded-xl border border-blue-100 bg-gradient-to-b from-white to-blue-50/30 px-3.5 py-2.5 text-sm text-gray-900 shadow-sm transition-all duration-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 focus:outline-none';
  const totalOrders = purchaseOrders.length;
  const pendingOrders = purchaseOrders.filter((order) => order.status === 'pending').length;
  const approvedOrders = purchaseOrders.filter((order) => order.status === 'approved').length;
  const totalOrderValue = purchaseOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const sortedPurchaseOrders = [...purchaseOrders].sort((a, b) => {
    const dateA = new Date(a.created_at || a.order_date).getTime();
    const dateB = new Date(b.created_at || b.order_date).getTime();
    if (dateA !== dateB) return dateB - dateA;
    return b.id - a.id;
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(37,99,235,0.15),_transparent_26%),linear-gradient(180deg,_#f6f9ff_0%,_#eef4ff_45%,_#eaf2ff_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 overflow-hidden rounded-[30px] border border-white/65 bg-white/75 shadow-[0_28px_90px_-45px_rgba(37,99,235,0.45)] backdrop-blur-xl">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1.4fr_0.95fr] lg:px-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-sm font-medium text-cyan-700">
              <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
              Purchasing command center
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Purchase Orders</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Manage purchase orders for raw materials, finished products, and office assets with a cleaner, faster procurement workspace.
              </p>
            </div>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-600 via-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-300/50 transition hover:scale-[1.02] hover:from-blue-700 hover:to-sky-700"
              >
                Add Purchase Order
              </button>
              <button
                onClick={() => router.push('/dashboard/purchasing/grn')}
                className="inline-flex items-center rounded-full border border-cyan-200 bg-white px-5 py-2.5 text-sm font-semibold text-cyan-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-50"
              >
                Go to GRN
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-3xl border border-blue-200/70 bg-gradient-to-br from-blue-600 to-cyan-600 p-5 text-white shadow-lg shadow-blue-300/40">
              <p className="text-xs uppercase tracking-[0.24em] text-white/75">Total Orders</p>
              <p className="mt-3 text-3xl font-bold">{totalOrders}</p>
              <p className="mt-2 text-sm text-white/80">LKR {totalOrderValue.toFixed(2)} total order value</p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-600">Pending</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{pendingOrders}</p>
              <p className="mt-2 text-sm text-slate-500">Waiting for approval or fulfillment</p>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-1">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Approved</p>
              <p className="mt-3 text-3xl font-bold text-slate-900">{approvedOrders}</p>
              <p className="mt-2 text-sm text-slate-500">Ready for GRN and receiving process</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Purchase Order Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-[1500px] overflow-hidden rounded-[32px] border border-white/20 bg-white shadow-[0_40px_130px_-45px_rgba(30,64,175,0.6)]">
            <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.35),_transparent_45%),linear-gradient(125deg,_rgba(15,23,42,0.95)_0%,_rgba(30,64,175,0.94)_45%,_rgba(8,145,178,0.9)_100%)]"></div>
            <div className="relative max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    🧾
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Create Purchase Order</h3>
                  <p className="mt-2 max-w-3xl text-sm text-white/85 sm:text-base">Select from available inventory suggestions or type brand-new item names, then finalize quantities and pricing in one extra-large workspace.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6 px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-500">Order Meta</p>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className={modalLabelClass}>Supplier</label>
                    <select
                      value={formData.supplier_id}
                      onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                      className={modalSelectClass}
                      required
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={modalLabelClass}>Order Date</label>
                    <input
                      type="date"
                      value={formData.order_date}
                      onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                      className={modalInputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Expected Delivery Date</label>
                    <input
                      type="date"
                      value={formData.expected_delivery_date}
                      onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
                      className={modalInputClass}
                    />
                  </div>
                  <div>
                    <label className={modalLabelClass}>Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className={modalInputClass}
                      rows={3}
                    />
                  </div>
                </div>
                </div>

                {/* Order Items */}
                <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <h4 className="text-md font-semibold text-gray-900">Order Items</h4>
                      <p className="text-xs text-gray-500">Build line items using inventory suggestions or manual entries.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addItem}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-lg text-blue-700 bg-blue-100 hover:bg-blue-200"
                    >
                      Add Item
                    </button>
                  </div>
                  <div className="space-y-4">
                    {formData.items.map((item, index) => (
                      <div key={index} className="p-4 border border-blue-100 rounded-2xl bg-gradient-to-br from-blue-50/40 to-white shadow-sm">
                        <div className="flex justify-between items-center mb-3">
                          <h5 className="text-sm font-semibold text-gray-900">Item {index + 1}</h5>
                          <button
                            type="button"
                            onClick={() => removeItem(index)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Remove
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          <div>
                            <label className={modalLabelClass}>Available Stock Suggestion</label>
                            <select
                              value={item.inventory_item_id}
                              onChange={(e) => handleInventorySelect(index, e.target.value)}
                              className={modalSelectClass}
                            >
                              <option value={0}>Select Item</option>
                              {inventoryItems.map((invItem) => (
                                <option key={invItem.id} value={invItem.id}>
                                  {invItem.name} ({invItem.code}) • Stock: {Number(invItem.current_stock || 0).toFixed(2)}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className={modalLabelClass}>Or Type New Item Name</label>
                            <input
                              type="text"
                              value={item.item_name}
                              onChange={(e) => {
                                updateItem(index, 'item_name', e.target.value);
                                if (e.target.value.trim().length > 0 && item.inventory_item_id !== 0) {
                                  updateItem(index, 'inventory_item_id', 0);
                                }
                              }}
                              className={modalInputClass}
                              placeholder="Type item if not in stock list"
                              required={item.inventory_item_id === 0}
                            />
                          </div>

                          <div>
                            <label className={modalLabelClass}>Item Code (Optional)</label>
                            <input
                              type="text"
                              value={item.item_code}
                              onChange={(e) => updateItem(index, 'item_code', e.target.value.toUpperCase())}
                              className={modalInputClass}
                              placeholder="Auto-generated if empty"
                            />
                          </div>

                          <div>
                            <label className={modalLabelClass}>Unit</label>
                            <select
                              value={item.item_unit}
                              onChange={(e) => updateItem(index, 'item_unit', e.target.value)}
                              className={modalSelectClass}
                            >
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

                          <div>
                            <label className={modalLabelClass}>Unit Price (LKR)</label>
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                              className={modalInputClass}
                              min="0"
                              step="0.01"
                              required
                              placeholder="0.00"
                            />
                          </div>

                          <div>
                            <label className={modalLabelClass}>Quantity</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value))}
                              className={modalInputClass}
                              min="0.01"
                              step="0.01"
                              required
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sticky bottom-0 -mx-6 flex justify-end space-x-3 border-t border-blue-100 bg-white/95 px-6 py-4 sm:-mx-8 sm:px-8">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-5 py-2.5 border border-blue-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-blue-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 border border-transparent rounded-xl text-sm font-semibold text-white hover:from-blue-700 hover:to-cyan-700"
                  >
                    Create Order
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_20px_70px_-35px_rgba(30,64,175,0.45)]">
              <div className="border-b border-blue-100 bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">Purchase Order Registry</h2>
                <p className="mt-1 text-sm text-blue-100/85">Track all purchase orders with supplier details, statuses and totals.</p>
              </div>
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-100/80">
                  <tr>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Order #</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Supplier</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Order Date</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Amount (LKR)</th>
                    <th className="px-3 py-3.5 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Items</th>
                    <th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {sortedPurchaseOrders.map((order) => (
                    <tr key={order.id} className="transition hover:bg-blue-50/40">
                      <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-slate-900">
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{order.order_number}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-600">
                        {order.supplier.name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-600">
                        {new Date(order.created_at || order.order_date).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm font-semibold text-slate-800">
                        LKR {parseFloat(order.total_amount.toString()).toFixed(2)}
                      </td>
                      <td className="px-3 py-4 text-sm text-slate-600">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{order.items.length} items</span>
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button
                          onClick={() => viewOrder(order)}
                          className="mr-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          View
                        </button>
                        <button
                          onClick={() => printOrder(order)}
                          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Order Details Modal */}
      {showOrderDetails && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md">
          <div className="relative w-full max-w-6xl overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_36px_120px_-45px_rgba(30,64,175,0.58)]">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.35),_transparent_50%),linear-gradient(130deg,_rgba(15,23,42,0.95)_0%,_rgba(37,99,235,0.94)_45%,_rgba(8,145,178,0.9)_100%)]"></div>
            <div className="relative max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                <div>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl">
                    📋
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Purchase Order Details</h3>
                  <p className="mt-2 text-sm text-white/85 sm:text-base">
                    Reference: <span className="font-semibold">{selectedOrder.order_number}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowOrderDetails(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                >
                  <span className="text-2xl">&times;</span>
                </button>
              </div>

              <div className="space-y-6 px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">Supplier</p>
                    <p className="mt-3 text-lg font-semibold text-slate-900">{selectedOrder.supplier.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{selectedOrder.supplier.email}</p>
                    <p className="mt-1 text-sm text-slate-600">{selectedOrder.supplier.phone}</p>
                  </div>
                  <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">Order Information</p>
                    <p className="mt-3 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">Order Date:</span> {new Date(selectedOrder.order_date).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">Expected Delivery:</span> {selectedOrder.expected_delivery_date ? new Date(selectedOrder.expected_delivery_date).toLocaleDateString() : 'Not specified'}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-900">Status:</span>
                      <span className={`ml-2 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusColor(selectedOrder.status)}`}>
                        {selectedOrder.status}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
                  <div className="border-b border-blue-100 bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 px-6 py-4">
                    <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">Order Items</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-100/80">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Item</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Quantity</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Unit Price</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {selectedOrder.items.map((item, index) => (
                          <tr key={index} className="transition hover:bg-blue-50/40">
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                              {item.inventory_item.name}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                              {item.quantity}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                              LKR {parseFloat(item.unit_price.toString()).toFixed(2)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-800">
                              LKR {parseFloat(item.total_price.toString()).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                  <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                    {selectedOrder.notes && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">Notes</p>
                        <p className="mt-3 text-sm leading-6 text-slate-700">{selectedOrder.notes}</p>
                      </div>
                    )}
                    {!selectedOrder.notes && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-500">Notes</p>
                        <p className="mt-3 text-sm leading-6 text-slate-500">No additional notes were provided for this order.</p>
                      </div>
                    )}
                  </div>
                  <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-5 text-right shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Total Amount</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      LKR {parseFloat(selectedOrder.total_amount.toString()).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="sticky bottom-0 -mx-6 border-t border-blue-100 bg-white/95 px-6 py-4 text-right sm:-mx-8 sm:px-8">
                  <button
                    onClick={() => setShowOrderDetails(false)}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    Close Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {showPrintModal && selectedOrder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <style dangerouslySetInnerHTML={{
            __html: `
              @media print {
                .print-content { font-size: 12px; }
                .print\\:hidden { display: none !important; }
                body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              }
            `
          }} />
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="print-content">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">PURCHASE ORDER</h1>
                <p className="text-lg text-gray-600">Order Number: {selectedOrder.order_number}</p>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-8">
                <div>
                  <h3 className="font-bold text-gray-800 mb-2">Supplier Information</h3>
                  <p className="text-gray-700 font-semibold">{selectedOrder.supplier.name}</p>
                  <p className="text-gray-600">{selectedOrder.supplier.email}</p>
                  <p className="text-gray-600">{selectedOrder.supplier.phone}</p>
                  <p className="text-gray-600">{selectedOrder.supplier.address}</p>
                  <p className="text-gray-600">Contact: {selectedOrder.supplier.contact_person}</p>
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 mb-2">Order Information</h3>
                  <p className="text-gray-600"><span className="font-semibold">Order Date:</span> {new Date(selectedOrder.order_date).toLocaleDateString()}</p>
                  <p className="text-gray-600"><span className="font-semibold">Expected Delivery:</span> {selectedOrder.expected_delivery_date ? new Date(selectedOrder.expected_delivery_date).toLocaleDateString() : 'Not specified'}</p>
                  <p className="text-gray-600"><span className="font-semibold">Status:</span> {selectedOrder.status}</p>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="font-bold text-gray-800 mb-4">Order Items</h3>
                <table className="w-full border-collapse border border-gray-300">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Item</th>
                      <th className="border border-gray-300 px-4 py-2 text-center font-semibold">Quantity</th>
                      <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Unit Price</th>
                      <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items.map((item, index) => (
                      <tr key={index}>
                        <td className="border border-gray-300 px-4 py-2">{item.inventory_item.name}</td>
                        <td className="border border-gray-300 px-4 py-2 text-center">{item.quantity}</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">LKR {parseFloat(item.unit_price.toString()).toFixed(2)}</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">LKR {parseFloat(item.total_price.toString()).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100">
                      <td colSpan={3} className="border border-gray-300 px-4 py-2 text-right font-bold">Total Amount:</td>
                      <td className="border border-gray-300 px-4 py-2 text-right font-bold">LKR {parseFloat(selectedOrder.total_amount.toString()).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedOrder.notes && (
                <div className="mb-8">
                  <h3 className="font-bold text-gray-800 mb-2">Notes</h3>
                  <p className="text-gray-600 bg-gray-50 p-3 rounded">{selectedOrder.notes}</p>
                </div>
              )}

              <div className="text-center text-sm text-gray-500 mt-8">
                <p>Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6 print:hidden">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}