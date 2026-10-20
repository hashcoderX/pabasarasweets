import axios from '@/lib/http';
import {
  DISTRIBUTION_OFFLINE_KEYS,
  isLikelyNetworkError,
  readOfflineQueue,
  writeOfflineQueue,
  type OfflineQueueEntry,
} from '@/lib/distributionOffline';

type PendingOfflinePaymentPayload = {
  payment_number: string;
  distribution_invoice_id: number | null;
  customer_id: number;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_no: string;
  bank_name: string;
  status: string;
  notes: string;
  load_id?: number | null;
  cheque_date?: string | null;
};

type PendingOfflineReturnPayload = {
  return_number: string;
  distribution_invoice_id: number | null;
  customer_id: number;
  returned_inventory_item_id: number | null;
  return_date: string;
  total_quantity: number;
  total_amount: number;
  settlement_type: 'bill_deduction' | 'cash_refund' | 'item_exchange';
  settlement_amount: number;
  exchange_inventory_item_id: number | null;
  exchange_quantity: number;
  reason?: string | null;
  status: string;
  notes?: string;
  items?: Array<{
    inventory_item_id: number;
    item_code: string;
    item_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    amount: number;
    is_damaged: boolean;
  }>;
};

type PendingOfflineInvoice = {
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
      is_outstanding_settlement?: boolean;
    } | null;
    payments?: Array<{
      amount: number;
      method: 'cash' | 'check' | 'bank_transfer' | 'bill_to_bill';
      date: string;
      cheque_date?: string | null;
      reference?: string | null;
      bank_name?: string | null;
      target_invoice_id?: number | null;
      is_outstanding_settlement?: boolean;
    }>;
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
};

type DistributionSyncSummary = {
  syncedInvoices: number;
  syncedPayments: number;
  syncedReturns: number;
  pendingInvoices: number;
  pendingPayments: number;
  pendingReturns: number;
};

const buildHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

const generatePaymentNumber = () => `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const syncOfflineInvoices = async (token: string) => {
  const queue = readOfflineQueue<PendingOfflineInvoice['payload']>(DISTRIBUTION_OFFLINE_KEYS.invoices);
  if (queue.length === 0) return { synced: 0, pending: 0 };

  const stillPending: OfflineQueueEntry<PendingOfflineInvoice['payload']>[] = [];
  let synced = 0;

  for (const entry of queue) {
    const inv = entry.payload;
    try {
      const invoiceRes = await axios.post('/api/distribution/invoices', {
        load_id: inv.load_id ?? null,
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
      }, {
        headers: buildHeaders(token),
      });

      const createdInvoice = invoiceRes.data?.data;
      const createdInvoiceId = Number(createdInvoice?.id || 0);

      const offlinePayments = inv.payments || (inv.payment ? [inv.payment] : []);
      if (offlinePayments.length > 0 && createdInvoiceId > 0) {
        const paymentRows = offlinePayments.map((payment) => ({
          payment_number: generatePaymentNumber(),
          distribution_invoice_id: Number(payment.target_invoice_id || createdInvoiceId || 0),
          load_id: createdInvoice?.load_id ?? inv.load_id ?? null,
          customer_id: createdInvoice?.customer_id ?? inv.customer_id,
          payment_date: payment.date,
          cheque_date: payment.method === 'check' ? (payment.cheque_date || null) : null,
          amount: payment.amount,
          payment_method: payment.method === 'bill_to_bill' ? 'cash' : payment.method,
          reference_no: payment.reference || null,
          bank_name: payment.bank_name || null,
          status: 'received',
          notes: payment.is_outstanding_settlement
            ? `Outstanding settlement from invoice ${createdInvoice?.invoice_number || inv.invoice_number} (offline sync)`
            : `Auto payment from invoice ${createdInvoice?.invoice_number || inv.invoice_number} (offline sync)`,
        }));

        if (paymentRows.some((payment) => Number(payment.distribution_invoice_id) <= 0)) {
          throw new Error('Missing target invoice for offline payment sync.');
        }
        await axios.post('/api/distribution/payments/bulk', { payments: paymentRows }, { headers: buildHeaders(token) });
      }

      const rp = inv.returnPayload;
      if (rp && createdInvoiceId > 0) {
        await axios.post('/api/distribution/returns', {
          return_number: rp.return_number,
          distribution_invoice_id: createdInvoiceId,
          customer_id: createdInvoice?.customer_id ?? inv.customer_id,
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
        }, { headers: buildHeaders(token) });
      }

      synced += 1;
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        stillPending.push(entry);
        continue;
      }

      console.error('Failed to sync offline invoice entry, keeping in queue:', error);
      stillPending.push(entry);
    }
  }

  writeOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.invoices, stillPending);
  return { synced, pending: stillPending.length };
};

const syncOfflinePayments = async (token: string) => {
  const queue = readOfflineQueue<PendingOfflinePaymentPayload>(DISTRIBUTION_OFFLINE_KEYS.payments);
  if (queue.length === 0) return { synced: 0, pending: 0 };

  const stillPending: OfflineQueueEntry<PendingOfflinePaymentPayload>[] = [];
  let synced = 0;

  for (const entry of queue) {
    try {
      await axios.post('/api/distribution/payments', entry.payload, {
        headers: buildHeaders(token),
      });
      synced += 1;
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        stillPending.push(entry);
        continue;
      }

      console.error('Failed to sync offline payment entry, keeping in queue:', error);
      stillPending.push(entry);
    }
  }

  writeOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.payments, stillPending);
  return { synced, pending: stillPending.length };
};

const syncOfflineReturns = async (token: string) => {
  const queue = readOfflineQueue<PendingOfflineReturnPayload>(DISTRIBUTION_OFFLINE_KEYS.returns);
  if (queue.length === 0) return { synced: 0, pending: 0 };

  const stillPending: OfflineQueueEntry<PendingOfflineReturnPayload>[] = [];
  let synced = 0;

  for (const entry of queue) {
    try {
      await axios.post('/api/distribution/returns', entry.payload, {
        headers: buildHeaders(token),
      });
      synced += 1;
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        stillPending.push(entry);
        continue;
      }

      console.error('Failed to sync offline return entry, keeping in queue:', error);
      stillPending.push(entry);
    }
  }

  writeOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.returns, stillPending);
  return { synced, pending: stillPending.length };
};

export const syncDistributionOfflineQueues = async (token: string): Promise<DistributionSyncSummary> => {
  if (!token) {
    return {
      syncedInvoices: 0,
      syncedPayments: 0,
      syncedReturns: 0,
      pendingInvoices: 0,
      pendingPayments: 0,
      pendingReturns: 0,
    };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      syncedInvoices: 0,
      syncedPayments: 0,
      syncedReturns: 0,
      pendingInvoices: readOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.invoices).length,
      pendingPayments: readOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.payments).length,
      pendingReturns: readOfflineQueue(DISTRIBUTION_OFFLINE_KEYS.returns).length,
    };
  }

  const invoiceResult = await syncOfflineInvoices(token);
  const paymentResult = await syncOfflinePayments(token);
  const returnResult = await syncOfflineReturns(token);

  return {
    syncedInvoices: invoiceResult.synced,
    syncedPayments: paymentResult.synced,
    syncedReturns: returnResult.synced,
    pendingInvoices: invoiceResult.pending,
    pendingPayments: paymentResult.pending,
    pendingReturns: returnResult.pending,
  };
};
