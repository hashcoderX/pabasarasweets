'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function DistributionReturnsPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returns, setReturns] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [viewReturn, setViewReturn] = useState<any | null>(null);
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);

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

  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) router.push('/');
    else setToken(storedToken);
  }, [router]);

  useEffect(() => { if (token) fetchData(); }, [token]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [returnsRes, customersRes, invoicesRes, inventoryRes] = await Promise.all([
        axios.get('/api/distribution/returns', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 100 } }),
        axios.get('/api/distribution/customers', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
        axios.get('/api/distribution/invoices', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
        axios.get('/api/stock/inventory', { headers: { Authorization: `Bearer ${token}` }, params: { per_page: 1000 } }),
      ]);

      setReturns(returnsRes.data?.data?.data || []);
      setCustomers(customersRes.data?.data?.data || []);
      setInvoices(invoicesRes.data?.data?.data || []);
      setInventory(inventoryRes.data?.data?.data || inventoryRes.data?.data || []);
      setForm((prev) => ({ ...prev, return_number: `RET-${Date.now()}` }));
    } catch (error) {
      console.error('Error loading returns data:', error);
      setReturns([]);
    } finally {
      setLoading(false);
    }
  };

  const createReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await axios.post('/api/distribution/returns', {
        ...form,
        customer_id: Number(form.customer_id),
        distribution_invoice_id: form.distribution_invoice_id ? Number(form.distribution_invoice_id) : null,
        inventory_item_id: form.inventory_item_id ? Number(form.inventory_item_id) : null,
        total_quantity: Number(form.total_quantity || 0),
        total_amount: Number(form.total_amount || 0),
      }, { headers: { Authorization: `Bearer ${token}` } });

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
      fetchData();
    } catch (error: any) {
      alert(error?.response?.data?.message || 'Failed to record return');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
              <Link
                href="/dashboard/distribution"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to Distribution
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Record new return</h2>
              <p className="text-xs text-gray-500">Link a return to a customer and optionally to an invoice and item.</p>
            </div>
          </div>

          <form onSubmit={createReturn} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Return Number</label>
                <input
                  value={form.return_number}
                  onChange={(e) => setForm({ ...form, return_number: e.target.value })}
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer</label>
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                  required
                >
                  <option value="">Select Customer</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.shop_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Linked Invoice (optional)</label>
                <select
                  value={form.distribution_invoice_id}
                  onChange={(e) => setForm({ ...form, distribution_invoice_id: e.target.value })}
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                >
                  <option value="">Select Invoice</option>
                  {invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>{invoice.invoice_number}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Return Date</label>
                <input
                  type="date"
                  value={form.return_date}
                  onChange={(e) => setForm({ ...form, return_date: e.target.value })}
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Returned Item (optional)</label>
                <select
                  value={form.inventory_item_id}
                  onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })}
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                >
                  <option value="">Select Item</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>{item.code} - {item.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Total Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.total_quantity}
                  onChange={(e) => setForm({ ...form, total_quantity: e.target.value })}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Total Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.total_amount}
                  onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 items-end">
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                <input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Reason for return"
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional details"
                  className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                />
              </div>
              <div className="md:col-span-1 flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full md:w-auto bg-green-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Record Return'}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Return records</h2>
              <p className="text-xs text-gray-500">Browse all distribution returns.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Return</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Invoice</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Loading...</td>
                  </tr>
                ) : returns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No returns yet.</td>
                  </tr>
                ) : (
                  returns.map((row) => {
                    const linkedInvoice = row.invoice || invoices.find((inv) => Number(inv.id) === Number(row.distribution_invoice_id));
                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
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
                          <button
                            type="button"
                            onClick={() => setViewReturn(row)}
                            className="px-3 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

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

                const settlementLabel = settlementType === 'bill_deduction'
                  ? 'Deduct bill amount'
                  : settlementType === 'cash_refund'
                  ? 'Return cash'
                  : settlementType === 'item_exchange'
                  ? 'Item exchange'
                  : settlementType || 'Not specified';

                return (
                  <div className="space-y-3 mt-2">
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">Returned Item</div>
                      <div className="px-3 py-2 text-xs sm:text-sm">
                        {returned ? (
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
    </div>
  );
}
