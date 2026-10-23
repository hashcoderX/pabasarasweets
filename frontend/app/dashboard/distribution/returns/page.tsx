'use client';

import { useCallback, useEffect, useState } from 'react';
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
  return_date: string;
  total_quantity: number;
  total_amount: number;
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
};

type ReturnLineItem = {
  lineId: string;
  inventory_item_id: string;
  quantity: string;
  amount: string;
};
type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };

export default function DistributionReturnsPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [returns, setReturns] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [viewReturn, setViewReturn] = useState<any | null>(null);
  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [pendingOfflineReturns, setPendingOfflineReturns] = useState<OfflineQueueEntry<PendingOfflineReturnPayload>[]>([]);
  const [syncingOfflineReturns, setSyncingOfflineReturns] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [returnLineItems, setReturnLineItems] = useState<ReturnLineItem[]>([
    { lineId: `line-${Date.now()}`, inventory_item_id: '', quantity: '', amount: '' },
  ]);
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
    setReturnLineItems([{ lineId: `line-${Date.now()}`, inventory_item_id: '', quantity: '', amount: '' }]);
  };

  const getInventoryCode = (item: InventoryOption) =>
    String(item.code || item.item_code || item.product_code || item.sku || '').trim();

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
    if (token) {
      fetchData();
      fetchWidgetVisibility(token);
    }
  }, [token]);

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

  const fetchData = useCallback(async () => {
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
      const inventoryRows = Array.isArray(inventoryRes.data?.data?.data)
        ? inventoryRes.data.data.data
        : Array.isArray(inventoryRes.data?.data)
          ? inventoryRes.data.data
          : [];
      setInventory((inventoryRows as InventoryOption[]).filter((item) => !isRawMaterialInventory(item)));
      setForm((prev) => ({ ...prev, return_number: `RET-${Date.now()}` }));
    } catch (error) {
      console.error('Error loading returns data:', error);
      setReturns([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

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
      return {
        inventory_item_id: Number(line.inventory_item_id),
        item_code: selectedItem ? getInventoryCode(selectedItem) : '',
        item_name: selectedItem?.name || '',
        quantity: Number(line.quantity || 0),
        amount: Number(line.amount || 0),
      };
    });

    const multiItemSection = [
      '[RETURN ITEMS]',
      ...normalizedLineItems.map(
        (line, index) =>
          `${index + 1}. ${line.item_code || '-'} ${line.item_name || '-'} | Qty: ${line.quantity.toFixed(2)} | Amount: ${line.amount.toFixed(2)}`
      ),
      '[/RETURN ITEMS]',
    ].join('\n');

    const mergedNotes = [form.notes?.trim(), multiItemSection].filter(Boolean).join('\n\n');

    const payload: PendingOfflineReturnPayload = {
      return_number: form.return_number,
      customer_id: Number(form.customer_id),
      distribution_invoice_id: form.distribution_invoice_id ? Number(form.distribution_invoice_id) : null,
      returned_inventory_item_id: firstReturnedItemId,
      return_date: form.return_date,
      total_quantity: computedQuantity,
      total_amount: computedAmount,
      reason: form.reason,
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
              {isWidgetVisible('distribution-returns-nav-back-button') && <Link
                href="/dashboard/distribution"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to Distribution
              </Link>}
              {!widgetControlsLocked && isWidgetVisible('distribution-returns-nav-back-button') && <button type="button" onClick={() => stageWidgetVisibilityChange('distribution-returns-nav-back-button', false)} className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Widget Controls</h3>
              <p className="text-xs text-slate-500">Hide widgets, fix controls, restore hidden widgets, and unlock controls.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => openSuperAdminConfirmation(pendingWidgetChanges, 'apply')} disabled={widgetControlsLocked || pendingWidgetChanges.length === 0} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Fix Widgets</button>
              <button type="button" onClick={restoreHiddenWidgetsAfterFix} disabled={hiddenWidgetCount === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Restore Widgets</button>
              <button type="button" onClick={openUnlockWidgetsAfterFix} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">Unlock Widgets</button>
            </div>
          </div>
        </section>

        {isWidgetVisible('distribution-returns-offline-status-card') && <section className={`rounded-xl border px-4 py-3 ${isOnline ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
            <p className={isOnline ? 'text-emerald-800' : 'text-amber-800'}>
              {isOnline ? 'Online mode: returns sync directly to server.' : 'Offline mode: new returns are saved locally.'}
            </p>
            <div className="flex items-center gap-2"><p className="text-xs font-semibold text-gray-700">
              Pending offline returns: {pendingOfflineReturns.length}
              {syncingOfflineReturns ? ' (syncing...)' : ''}
            </p>{!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('distribution-returns-offline-status-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}</div>
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
            {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('distribution-returns-actions-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>
        </section>}

        {isWidgetVisible('distribution-returns-records-card') && <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Return records</h2>
              <p className="text-xs text-gray-500">Browse all distribution returns.</p>
            </div>
            {!widgetControlsLocked && <button type="button" onClick={() => stageWidgetVisibilityChange('distribution-returns-records-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              {isWidgetVisible('distribution-returns-records-table-headings') && <thead className="bg-gray-50">
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
              </thead>}
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
                          {isWidgetVisible('distribution-returns-records-row-actions') && (
                          <button
                            type="button"
                            onClick={() => setViewReturn(row)}
                            className="px-3 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            View
                          </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>}
      </main>

      {isWidgetVisible('distribution-returns-create-modal-pane') && showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-5xl rounded-xl border border-gray-200 bg-white p-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="mb-3 flex items-start justify-between gap-3">
              {isWidgetVisible('distribution-returns-create-modal-heading') && <div>
                <h3 className="text-lg font-semibold text-gray-900">Add Return</h3>
                <p className="text-xs text-gray-500">Link a return to a customer and optionally to an invoice and item.</p>
              </div>}
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
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

              <div className="rounded-lg border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Return Items</h4>
                    <p className="text-xs text-gray-500">Add one or more items to this return bill.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setReturnLineItems((prev) => [
                        ...prev,
                        { lineId: `line-${Date.now()}-${prev.length}`, inventory_item_id: '', quantity: '', amount: '' },
                      ])
                    }
                    className="rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                  >
                    + Add Item
                  </button>
                </div>

                <div className="space-y-2">
                  {returnLineItems.map((line, index) => (
                    <div key={line.lineId} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-md border border-gray-200 p-2">
                      <div className="md:col-span-6">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Item</label>
                        <select
                          value={line.inventory_item_id}
                          onChange={(e) =>
                            setReturnLineItems((prev) =>
                              prev.map((row) =>
                                row.lineId === line.lineId ? { ...row, inventory_item_id: e.target.value } : row
                              )
                            )
                          }
                          className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                          required={index === 0}
                        >
                          <option value="">Select Item</option>
                          {inventory.filter((item) => !isRawMaterialInventory(item)).map((item) => (
                            <option key={item.id} value={item.id}>{getInventoryCode(item) || '-'} - {item.name || '-'}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Qty</label>
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
                          className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                          placeholder="0.00"
                          required={index === 0}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
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
                          className="w-full rounded-md border border-gray-300 text-sm text-black px-2 py-2"
                          placeholder="0.00"
                          required={index === 0}
                        />
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
                          className="w-full rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Total Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={returnLineItems.reduce((sum, line) => sum + Number(line.quantity || 0), 0).toFixed(2)}
                    className="w-full rounded-md border border-gray-300 bg-gray-50 text-sm text-black px-2 py-2"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Total Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={returnLineItems.reduce((sum, line) => sum + Number(line.amount || 0), 0).toFixed(2)}
                    className="w-full rounded-md border border-gray-300 bg-gray-50 text-sm text-black px-2 py-2"
                    readOnly
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
                {isWidgetVisible('distribution-returns-create-modal-action-buttons') && <div className="md:col-span-1 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="w-full md:w-auto rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full md:w-auto bg-green-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
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
      {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{returnWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
    </div>
  );
}
