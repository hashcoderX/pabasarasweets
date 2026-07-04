'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

interface InventoryItem {
  id: number;
  name: string;
  code: string;
  unit: string;
  current_stock: number;
  sell_price: number;
  unit_price: number;
}

interface Outlet {
  id: number;
  name: string;
  code: string;
}

interface StockTransfer {
  id: number;
  transfer_reference?: string | null;
  quantity: number;
  notes: string | null;
  transferred_at: string;
  inventory_item: { name: string; code: string; unit: string };
  outlet: { name: string; code: string };
  transferred_by_user?: { name: string; email: string } | null;
}

interface TransferReport {
  total_lines: number;
  total_invoices: number;
  total_outlets: number;
  total_items: number;
  total_quantity: number;
  last_transfer_at: string | null;
}

interface TransferLine {
  inventory_item_id: number;
  item_name: string;
  item_code: string;
  unit: string;
  quantity: number;
  unit_price: number;
  sub_amount: number;
}

interface TransferDetails {
  transfer_reference: string;
  transferred_at: string;
  notes: string | null;
  outlet: { name: string; code: string } | null;
  transferred_by_user: { name: string; email: string } | null;
  total_lines: number;
  total_quantity: number;
  lines: StockTransfer[];
}

export default function StockTransfersPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [report, setReport] = useState<TransferReport>({
    total_lines: 0,
    total_invoices: 0,
    total_outlets: 0,
    total_items: 0,
    total_quantity: 0,
    last_transfer_at: null,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [totalTransfers, setTotalTransfers] = useState(0);
  const [perPage] = useState(10);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedTransferDetails, setSelectedTransferDetails] = useState<TransferDetails | null>(null);

  const [outletId, setOutletId] = useState('');
  const [notes, setNotes] = useState('');

  const [itemSearch, setItemSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [lineQuantity, setLineQuantity] = useState('');
  const [transferLines, setTransferLines] = useState<TransferLine[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputBaseClass =
    'w-full rounded-xl border border-orange-100 bg-white/95 px-3.5 py-2.5 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 focus:outline-none';

  const router = useRouter();

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
      fetchData(currentPage);
    }
  }, [token, currentPage]);

  const fetchData = async (page = 1) => {
    try {
      setLoading(true);

      const [itemsRes, outletsRes, transfersRes] = await Promise.all([
        axios.get('/api/stock/inventory', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 }
        }),
        axios.get('/api/outlets', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: 1000 }
        }),
        axios.get('/api/stock/transfers', {
          headers: { Authorization: `Bearer ${token}` },
          params: { per_page: perPage, page }
        }),
      ]);

      const inventoryItems = itemsRes.data?.success ? (itemsRes.data?.data?.data || itemsRes.data?.data || []) : [];
      const activeItems = inventoryItems.filter((item: any) => item.status === 'active');
      const mappedItems: InventoryItem[] = activeItems.map((item: any) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        unit: item.unit,
        current_stock: Number(item.current_stock) || 0,
        sell_price: Number(item.sell_price) || 0,
        unit_price: Number(item.unit_price) || 0,
      }));

      const outletList = outletsRes.data?.success ? (outletsRes.data?.data?.data || outletsRes.data?.data || []) : [];
      const activeOutlets: Outlet[] = outletList
        .filter((outlet: any) => outlet.status === 'active')
        .map((outlet: any) => ({ id: outlet.id, name: outlet.name, code: outlet.code }));

      const transferList = transfersRes.data?.success ? (transfersRes.data?.data?.data || transfersRes.data?.data || []) : [];
      const reportData = transfersRes.data?.report || {};

      setItems(mappedItems);
      setOutlets(activeOutlets);
      setTransfers(transferList);
      setReport({
        total_lines: Number(reportData.total_lines) || 0,
        total_invoices: Number(reportData.total_invoices) || 0,
        total_outlets: Number(reportData.total_outlets) || 0,
        total_items: Number(reportData.total_items) || 0,
        total_quantity: Number(reportData.total_quantity) || 0,
        last_transfer_at: reportData.last_transfer_at || null,
      });
      setLastPage(Number(transfersRes.data?.data?.last_page) || 1);
      setTotalTransfers(Number(transfersRes.data?.data?.total) || 0);
    } catch (error) {
      console.error('Error loading stock transfer data:', error);
      setItems([]);
      setOutlets([]);
      setTransfers([]);
      setReport({
        total_lines: 0,
        total_invoices: 0,
        total_outlets: 0,
        total_items: 0,
        total_quantity: 0,
        last_transfer_at: null,
      });
      setLastPage(1);
      setTotalTransfers(0);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const search = itemSearch.trim().toLowerCase();
    if (!search) return [];

    return items
      .filter((item) =>
        item.code.toLowerCase().includes(search) ||
        item.name.toLowerCase().includes(search)
      )
      .slice(0, 8);
  }, [itemSearch, items]);

  const getExistingLineQty = (itemId: number) => {
    const line = transferLines.find((lineItem) => lineItem.inventory_item_id === itemId);
    return line ? line.quantity : 0;
  };

  const handleSelectItem = (item: InventoryItem) => {
    setSelectedItem(item);
    setItemSearch(`${item.code} - ${item.name}`);
    setShowDropdown(false);
    setHighlightedIndex(-1);
  };

  const addLineItem = () => {
    if (!selectedItem) {
      alert('Please select an item from suggestions.');
      return;
    }

    const qty = Number(lineQuantity);
    if (!qty || qty <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }

    const existingQty = getExistingLineQty(selectedItem.id);
    const totalRequested = existingQty + qty;

    if (totalRequested > selectedItem.current_stock) {
      alert(`Requested quantity exceeds available stock for ${selectedItem.name}.`);
      return;
    }

    const unitPrice = selectedItem.sell_price > 0 ? selectedItem.sell_price : selectedItem.unit_price;

    setTransferLines((prev) => {
      const exists = prev.find((line) => line.inventory_item_id === selectedItem.id);

      if (exists) {
        return prev.map((line) =>
          line.inventory_item_id === selectedItem.id
            ? {
                ...line,
                quantity: line.quantity + qty,
                sub_amount: (line.quantity + qty) * line.unit_price,
              }
            : line
        );
      }

      return [
        ...prev,
        {
          inventory_item_id: selectedItem.id,
          item_name: selectedItem.name,
          item_code: selectedItem.code,
          unit: selectedItem.unit,
          quantity: qty,
          unit_price: unitPrice,
          sub_amount: qty * unitPrice,
        },
      ];
    });

    setSelectedItem(null);
    setItemSearch('');
    setLineQuantity('');
    setShowDropdown(false);
    setHighlightedIndex(-1);
  };

  const removeLineItem = (itemId: number) => {
    setTransferLines((prev) => prev.filter((line) => line.inventory_item_id !== itemId));
  };

  const invoiceTotal = transferLines.reduce((sum, line) => sum + line.sub_amount, 0);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!outletId) {
      alert('Please select an outlet.');
      return;
    }

    if (transferLines.length === 0) {
      alert('Please add at least one item line.');
      return;
    }

    try {
      setSaving(true);
      await axios.post('/api/stock/transfers', {
        outlet_id: Number(outletId),
        notes,
        items: transferLines.map((line) => ({
          inventory_item_id: line.inventory_item_id,
          quantity: line.quantity,
        })),
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setOutletId('');
      setNotes('');
      setTransferLines([]);
      setSelectedItem(null);
      setItemSearch('');
      setLineQuantity('');
      setCurrentPage(1);
      fetchData(1);
    } catch (error: any) {
      console.error('Error transferring stock:', error);
      const apiMessage = error?.response?.data?.message;
      const errorsObject = (error?.response?.data?.errors || {}) as Record<string, string[]>;
      const firstErrorGroup = Object.values(errorsObject)[0] || [];
      const quantityError = error?.response?.data?.errors?.quantity?.[0] || firstErrorGroup[0];
      alert(quantityError || apiMessage || 'Failed to transfer stock');
    } finally {
      setSaving(false);
    }
  };

  const handleViewDetails = async (transfer: StockTransfer) => {
    if (!transfer.transfer_reference) {
      alert('No transfer reference found for this record.');
      return;
    }

    try {
      setShowDetailsModal(true);
      setDetailsLoading(true);
      setSelectedTransferDetails(null);

      const response = await axios.get(
        `/api/stock/transfers/reference/${encodeURIComponent(transfer.transfer_reference)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const details = response.data?.success ? response.data?.data : null;
      setSelectedTransferDetails(details);
    } catch (error: any) {
      console.error('Error loading transfer details:', error);
      alert(error?.response?.data?.message || 'Failed to load transfer details');
      setShowDetailsModal(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handlePrintDetails = () => {
    if (!selectedTransferDetails) return;

    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) {
      alert('Unable to open print window. Please allow popups.');
      return;
    }

    const rows = selectedTransferDetails.lines
      .map((line) => {
        const itemName = line.inventory_item?.name || '-';
        const itemCode = line.inventory_item?.code || '-';
        const unit = line.inventory_item?.unit || '';
        return `<tr>
          <td style="padding:8px;border:1px solid #ddd;">${itemName}</td>
          <td style="padding:8px;border:1px solid #ddd;">${itemCode}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${Number(line.quantity).toFixed(2)} ${unit}</td>
        </tr>`;
      })
      .join('');

    win.document.write(`
      <html>
        <head>
          <title>Transfer ${selectedTransferDetails.transfer_reference}</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 20px; color: #111;">
          <h2 style="margin-bottom: 4px;">Transfer Details</h2>
          <p style="margin: 2px 0;"><strong>Reference:</strong> ${selectedTransferDetails.transfer_reference}</p>
          <p style="margin: 2px 0;"><strong>Date:</strong> ${new Date(selectedTransferDetails.transferred_at).toLocaleString()}</p>
          <p style="margin: 2px 0;"><strong>Outlet:</strong> ${selectedTransferDetails.outlet?.name || '-'} (${selectedTransferDetails.outlet?.code || '-'})</p>
          <p style="margin: 2px 0;"><strong>Transferred By:</strong> ${selectedTransferDetails.transferred_by_user?.name || '-'}</p>
          <p style="margin: 2px 0;"><strong>Notes:</strong> ${selectedTransferDetails.notes || '-'}</p>
          <table style="margin-top: 16px; width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="padding:8px;border:1px solid #ddd;text-align:left;">Item</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:left;">Code</th>
                <th style="padding:8px;border:1px solid #ddd;text-align:right;">Quantity</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin-top: 10px;"><strong>Total Lines:</strong> ${selectedTransferDetails.total_lines}</p>
          <p><strong>Total Quantity:</strong> ${Number(selectedTransferDetails.total_quantity).toFixed(2)}</p>
        </body>
      </html>
    `);

    win.document.close();
    win.focus();
    win.print();
  };

  const handleDownloadDetails = () => {
    if (!selectedTransferDetails) return;

    const header = [
      'Reference',
      'Date',
      'Outlet',
      'Outlet Code',
      'Item',
      'Item Code',
      'Unit',
      'Quantity',
      'Transferred By',
      'Notes',
    ];

    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const rows = selectedTransferDetails.lines.map((line) => [
      selectedTransferDetails.transfer_reference,
      new Date(selectedTransferDetails.transferred_at).toLocaleString(),
      selectedTransferDetails.outlet?.name || '',
      selectedTransferDetails.outlet?.code || '',
      line.inventory_item?.name || '',
      line.inventory_item?.code || '',
      line.inventory_item?.unit || '',
      Number(line.quantity).toFixed(2),
      selectedTransferDetails.transferred_by_user?.name || '',
      selectedTransferDetails.notes || '',
    ]);

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => escapeCsv(String(cell))).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedTransferDetails.transfer_reference}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 relative overflow-hidden">
      <div className="absolute inset-0 opacity-35 pointer-events-none">
        <div className="absolute top-10 left-12 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-2xl animate-pulse"></div>
        <div className="absolute top-24 right-12 w-72 h-72 bg-amber-200 rounded-full mix-blend-multiply filter blur-2xl animate-pulse"></div>
        <div className="absolute -bottom-8 left-1/3 w-80 h-80 bg-yellow-200 rounded-full mix-blend-multiply filter blur-2xl animate-pulse"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="rounded-2xl border border-white/70 bg-white/85 backdrop-blur-xl shadow-xl">
          <div className="px-5 py-6 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.18em] uppercase text-orange-500 font-semibold">Distribution Center</p>
              <h3 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                Transfer Stock to Outlets
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                Build transfer invoices with quick item search and move inventory from central stock to active outlets.
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard/stock')}
              className="px-4 py-2 rounded-lg text-sm font-medium text-orange-700 border border-orange-200 bg-orange-50 hover:bg-orange-100"
            >
              Back to Stock
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="rounded-xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Invoices</p>
            <p className="text-2xl font-bold text-gray-900">{report.total_invoices}</p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Transfer Lines</p>
            <p className="text-2xl font-bold text-gray-900">{report.total_lines}</p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Quantity</p>
            <p className="text-2xl font-bold text-gray-900">{report.total_quantity.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Outlets</p>
            <p className="text-2xl font-bold text-gray-900">{report.total_outlets}</p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 backdrop-blur-lg shadow-sm p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Last Transfer</p>
            <p className="text-sm font-semibold text-gray-900">
              {report.last_transfer_at ? new Date(report.last_transfer_at).toLocaleString() : '-'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-xl shadow-xl">
          <div className="px-5 py-6 sm:px-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">New Transfer Invoice</h4>
            <form onSubmit={handleTransfer} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inventory Item</label>
                <div className="relative">
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => {
                      setItemSearch(e.target.value);
                      setSelectedItem(null);
                      setShowDropdown(true);
                      setHighlightedIndex(-1);
                    }}
                    onFocus={() => {
                      setShowDropdown(true);
                      setHighlightedIndex(-1);
                    }}
                    onKeyDown={(e) => {
                      if (!showDropdown || filteredItems.length === 0) {
                        return;
                      }

                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHighlightedIndex((prev) => (prev < filteredItems.length - 1 ? prev + 1 : 0));
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredItems.length - 1));
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const targetIndex = highlightedIndex >= 0 ? highlightedIndex : 0;
                        const picked = filteredItems[targetIndex];
                        if (picked) {
                          handleSelectItem(picked);
                        }
                      } else if (e.key === 'Escape') {
                        setShowDropdown(false);
                        setHighlightedIndex(-1);
                      }
                    }}
                    placeholder="Scan barcode or type item code/name"
                    className={inputBaseClass}
                  />
                  {showDropdown && filteredItems.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full bg-white border border-orange-100 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                      {filteredItems.map((item, index) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectItem(item)}
                          className={`w-full text-left px-3 py-2 border-b last:border-b-0 ${
                            highlightedIndex === index ? 'bg-orange-100' : 'hover:bg-orange-50'
                          }`}
                        >
                          <div className="text-sm font-medium text-gray-900">{item.code} - {item.name}</div>
                          <div className="text-xs text-gray-600">Stock: {item.current_stock} {item.unit}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedItem && (
                  <p className="mt-1 text-xs text-green-700">
                    Selected: {selectedItem.name} | Available: {selectedItem.current_stock} {selectedItem.unit}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outlet</label>
                <select
                  value={outletId}
                  onChange={(e) => setOutletId(e.target.value)}
                  className={inputBaseClass}
                  required
                >
                  <option value="">Select outlet</option>
                  {outlets.map((outlet) => (
                    <option key={outlet.id} value={outlet.id}>
                      {outlet.name} ({outlet.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={lineQuantity}
                  onChange={(e) => setLineQuantity(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLineItem();
                    }
                  }}
                  className={inputBaseClass}
                  placeholder="Type qty and press Enter"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputBaseClass}
                  placeholder="Optional invoice note"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={addLineItem}
                className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:from-sky-700 hover:to-blue-700"
              >
                Add Item Line
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-orange-50 to-amber-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Sub Amount</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {transferLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No line items added.</td>
                    </tr>
                  ) : (
                    transferLines.map((line) => (
                      <tr key={line.inventory_item_id}>
                        <td className="px-4 py-2 text-sm text-gray-700">{line.item_name}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{line.item_code}</td>
                        <td className="px-4 py-2 text-sm text-gray-700 text-right">{line.quantity.toFixed(2)} {line.unit}</td>
                        <td className="px-4 py-2 text-sm text-gray-700 text-right">{line.unit_price.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">{line.sub_amount.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeLineItem(line.inventory_item_id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-gradient-to-r from-orange-50 to-amber-50">
                  <tr>
                    <td colSpan={4} className="px-4 py-2 text-right text-sm font-semibold text-gray-700">Invoice Total</td>
                    <td className="px-4 py-2 text-right text-sm font-bold text-gray-900">{invoiceTotal.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 border border-transparent rounded-lg text-sm font-medium text-white hover:from-orange-600 hover:to-amber-600 disabled:opacity-50"
              >
                {saving ? 'Transferring...' : 'Submit Transfer Invoice'}
              </button>
            </div>
          </form>
          </div>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-xl shadow-xl">
          <div className="px-5 py-6 sm:px-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-gray-900">Recent Transfers</h4>
            <p className="text-sm text-gray-500">Total Records: {totalTransfers}</p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-orange-50 to-amber-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Outlet</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">By</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">No transfers recorded yet.</td>
                  </tr>
                ) : (
                  transfers.map((transfer) => (
                    <tr key={transfer.id}>
                      <td className="px-4 py-2 text-sm text-gray-700">{transfer.transfer_reference || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{new Date(transfer.transferred_at).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{transfer.inventory_item?.name} ({transfer.inventory_item?.code})</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{transfer.outlet?.name} ({transfer.outlet?.code})</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{Number(transfer.quantity).toFixed(2)} {transfer.inventory_item?.unit}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{transfer.transferred_by_user?.name || '-'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        <button
                          type="button"
                          onClick={() => handleViewDetails(transfer)}
                          className="px-3 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-md text-xs hover:from-orange-600 hover:to-amber-600"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">Page {currentPage} of {lastPage}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(lastPage, prev + 1))}
              disabled={currentPage === lastPage}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          </div>
        </div>

        {showDetailsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto border border-white/60">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50">
              <h3 className="text-lg font-semibold text-gray-900">Transfer Details</h3>
              <button
                type="button"
                onClick={() => {
                  setShowDetailsModal(false);
                  setSelectedTransferDetails(null);
                }}
                className="text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
            </div>

            <div className="p-6">
              {detailsLoading ? (
                <div className="text-center py-10 text-gray-600">Loading transfer details...</div>
              ) : !selectedTransferDetails ? (
                <div className="text-center py-10 text-gray-600">No details found.</div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-orange-50/70 border border-orange-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase">Reference</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedTransferDetails.transfer_reference}</p>
                    </div>
                    <div className="bg-orange-50/70 border border-orange-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase">Date</p>
                      <p className="text-sm font-semibold text-gray-900">{new Date(selectedTransferDetails.transferred_at).toLocaleString()}</p>
                    </div>
                    <div className="bg-orange-50/70 border border-orange-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase">Transferred By</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedTransferDetails.transferred_by_user?.name || '-'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-amber-50/70 border border-amber-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase">Outlet</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {selectedTransferDetails.outlet?.name || '-'} ({selectedTransferDetails.outlet?.code || '-'})
                      </p>
                    </div>
                    <div className="bg-amber-50/70 border border-amber-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase">Total Lines</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedTransferDetails.total_lines}</p>
                    </div>
                    <div className="bg-amber-50/70 border border-amber-100 rounded-lg p-3">
                      <p className="text-xs text-gray-500 uppercase">Total Quantity</p>
                      <p className="text-sm font-semibold text-gray-900">{Number(selectedTransferDetails.total_quantity).toFixed(2)}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 uppercase">Notes</p>
                    <p className="text-sm text-gray-800">{selectedTransferDetails.notes || '-'}</p>
                  </div>

                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-orange-50 to-amber-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedTransferDetails.lines.map((line) => (
                          <tr key={line.id}>
                            <td className="px-4 py-2 text-sm text-gray-700">{line.inventory_item?.name || '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700">{line.inventory_item?.code || '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700">{line.inventory_item?.unit || '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(line.quantity).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handlePrintDetails}
                      className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg text-sm hover:from-orange-600 hover:to-amber-600"
                    >
                      Print
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadDetails}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-lg text-sm hover:from-blue-700 hover:to-sky-700"
                    >
                      Download CSV
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
