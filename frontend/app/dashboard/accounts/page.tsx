'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/http';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../lib/apiClient';

interface CompanyAccountEntry {
  id: number;
  bank_name?: string;
  account_no?: string;
  current_balance?: number;
}

interface CompanyProfile {
  id: number;
  name: string;
  currency?: string;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
  bank_accounts?: CompanyAccountEntry[];
  cheque_accounts?: CompanyAccountEntry[];
}

interface LedgerRow {
  amount?: number | string;
  type?: string;
}

interface GrnLedgerRow {
  payment_timing?: string;
  net_amount?: number | string;
  paid_amount?: number | string;
}

interface AdvanceLedgerRow {
  amount?: number | string;
  entry_type?: string;
}

type SuperAdminModalMode = 'apply' | 'restore' | 'unlock';
type WidgetVisibilityChange = { widget_key: string; is_visible: boolean };
const ACCOUNTS_DASHBOARD_REQUEST_TIMEOUT_MS = 45000;

export default function AccountsPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [companyBalances, setCompanyBalances] = useState<CompanyProfile[]>([]);
  const [cashBookBalance, setCashBookBalance] = useState(0);
  const [pettyBalance, setPettyBalance] = useState(0);
  const [deliveryBalance, setDeliveryBalance] = useState(0);
  const [grnPayableBalance, setGrnPayableBalance] = useState(0);
  const [advanceNetBalance, setAdvanceNetBalance] = useState(0);
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

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);
  const isWidgetVisible = (widgetKey: string) => widgetVisibility[widgetKey] !== false;
  const accountsWidgetItems = [
    { id: 'accounts-nav-bar', name: 'Accounts Navigation Bar' },
    { id: 'accounts-hero-card', name: 'Accounts Hero Card' },
    { id: 'accounts-modules-grid', name: 'Accounts Modules Grid' },
    { id: 'accounts-module-grn-card', name: 'Accounts GRN Payment Control Card' },
    { id: 'accounts-module-main-card', name: 'Accounts Company Main Account Card' },
    { id: 'accounts-module-cheque-card', name: 'Accounts Cheque Registry Card' },
    { id: 'accounts-module-advance-card', name: 'Accounts Advance Payments Card' },
    { id: 'accounts-module-petty-card', name: 'Accounts Petty Cash Card' },
    { id: 'accounts-module-delivery-card', name: 'Accounts Delivery Cash Card' },
  ];

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  const fetchWidgetVisibility = useCallback(async (authToken: string) => {
    if (!authToken) return;
    try {
      const response = await axios.get('/api/dashboard/widgets/me', {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/json',
        },
      });
      setWidgetVisibility(response.data?.data?.widgets || {});
      setWidgetControlsLocked(Boolean(response.data?.data?.widget_controls_locked));
    } catch {
      setWidgetVisibility({});
      setWidgetControlsLocked(false);
    }
  }, []);

  const calcBalanceFromRows = (rows: LedgerRow[]) => {
    if (!Array.isArray(rows)) return 0;
    return rows.reduce((sum, row) => {
      const amount = Number(row?.amount || 0);
      const type = String(row?.type || '');
      return type === 'in' ? sum + amount : sum - amount;
    }, 0);
  };

  const fetchLedgerBalance = async (endpoint: string) => {
    try {
      const res = await api.get(endpoint, {
        params: { per_page: 500 },
        timeout: ACCOUNTS_DASHBOARD_REQUEST_TIMEOUT_MS,
      });
      const payload = res.data;
      const rows = Array.isArray(payload)
        ? payload
        : (payload?.data?.data || payload?.data || []);
      return calcBalanceFromRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error(`Failed to load ${endpoint}:`, error);
      return 0;
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchWidgetVisibility(token);

    const loadAccountsDashboard = async () => {
      try {
        const [mainCashBalance, pettyCashBalance, deliveryCashBalance] = await Promise.all([
          fetchLedgerBalance('/main-cash-transactions'),
          fetchLedgerBalance('/petty-cash-transactions'),
          fetchLedgerBalance('/delivery-cash-transactions'),
        ]);

        setCashBookBalance(mainCashBalance);
        setPettyBalance(pettyCashBalance);
        setDeliveryBalance(deliveryCashBalance);

        const [grnResult, companiesResult, advanceResult] = await Promise.allSettled([
          api.get('/purchasing/grn', { timeout: ACCOUNTS_DASHBOARD_REQUEST_TIMEOUT_MS }),
          api.get('/companies', { timeout: ACCOUNTS_DASHBOARD_REQUEST_TIMEOUT_MS }),
          api.get('/advance-payments', { timeout: ACCOUNTS_DASHBOARD_REQUEST_TIMEOUT_MS }),
        ]);

        const grnRows =
          grnResult.status === 'fulfilled'
            ? (Array.isArray(grnResult.value.data)
              ? grnResult.value.data
              : (grnResult.value.data?.data || []))
            : [];

        const grnPayable = (Array.isArray(grnRows) ? grnRows : []).reduce((sum: number, grn: GrnLedgerRow) => {
          if (String(grn?.payment_timing || 'post_payment') !== 'post_payment') {
            return sum;
          }
          const net = Number(grn?.net_amount || 0);
          const paid = Number(grn?.paid_amount || 0);
          const balance = Math.max(net - paid, 0);
          return sum + balance;
        }, 0);
        setGrnPayableBalance(grnPayable);

        const advanceRows =
          advanceResult.status === 'fulfilled'
            ? (advanceResult.value.data?.data?.data ?? advanceResult.value.data?.data ?? [])
            : [];
        const netAdvance = (Array.isArray(advanceRows) ? advanceRows : []).reduce((sum: number, row: AdvanceLedgerRow) => {
          const amount = Number(row?.amount || 0);
          const entryType = String(row?.entry_type || 'out');
          return entryType === 'in' ? sum - amount : sum + amount;
        }, 0);
        setAdvanceNetBalance(netAdvance);

        const companyRows =
          companiesResult.status === 'fulfilled'
            ? (Array.isArray(companiesResult.value.data) ? companiesResult.value.data : (companiesResult.value.data?.data || []))
            : [];
        setCompanyBalances(Array.isArray(companyRows) ? companyRows : []);

        if (grnResult.status === 'rejected' || companiesResult.status === 'rejected' || advanceResult.status === 'rejected') {
          console.warn('One or more dashboard requests failed or timed out.', {
            grnError: grnResult.status === 'rejected' ? grnResult.reason : null,
            companiesError: companiesResult.status === 'rejected' ? companiesResult.reason : null,
            advanceError: advanceResult.status === 'rejected' ? advanceResult.reason : null,
          });
        }
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }
        console.error('Error loading company balances:', error);
        setCashBookBalance(0);
        setPettyBalance(0);
        setDeliveryBalance(0);
        setGrnPayableBalance(0);
        setAdvanceNetBalance(0);
        setCompanyBalances([]);
      } finally {
        setLoading(false);
      }
    };

    loadAccountsDashboard();
  }, [token, fetchWidgetVisibility]);

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
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
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
    const hiddenKeys = accountsWidgetItems.map((item) => item.id).filter((key) => widgetVisibility[key] === false);
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
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      setWidgetVisibility((prev) => ({ ...prev, [widgetKey]: true }));
    } finally {
      setRestoreWidgetLoadingKey(null);
    }
  };

  const unlockWidgetControls = async () => {
    if (!token || !superAdminEmail.trim() || !superAdminPassword) return;
    const fallbackWidgetKey = accountsWidgetItems[0]?.id || 'accounts-hero-card';

    try {
      setSuperAdminConfirmLoading(true);
      await axios.put('/api/dashboard/widgets/me', {
        widget_key: fallbackWidgetKey,
        is_visible: isWidgetVisible(fallbackWidgetKey),
        super_admin_email: superAdminEmail.trim(),
        super_admin_password: superAdminPassword,
        lock_widget_controls: false,
      }, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      setWidgetControlsLocked(false);
      setShowSuperAdminConfirmModal(false);
      setPendingWidgetChanges([]);
      setWidgetVisibilitySnapshot(null);
    } finally {
      setSuperAdminConfirmLoading(false);
    }
  };

  const companySummary = useMemo(() => {
    const totalCash = companyBalances.reduce((sum, company) => sum + Number(company.current_cash_balance || 0), 0);
    const totalBank = companyBalances.reduce((sum, company) => sum + Number(company.current_bank_balance || 0), 0);
    const totalCheque = companyBalances.reduce((sum, company) => sum + Number(company.current_cheque_balance || 0), 0);

    return {
      totalCash,
      totalBank,
      totalCheque,
      grandTotal: totalCash + totalBank + totalCheque,
    };
  }, [companyBalances]);

  const modules = [
    {
      title: 'GRN Payment Control',
      widgetKey: 'accounts-module-grn-card',
      icon: '🧮',
      href: '/dashboard/accounts/grn-payments',
      desc: 'Settle GRN net amounts and track unpaid or partial supplier payments.',
      balance: grnPayableBalance,
      color: 'from-rose-500 to-pink-500',
    },
    {
      title: 'Company Main Accounts',
      widgetKey: 'accounts-module-main-card',
      icon: '🏦',
      href: '/dashboard/accounts/main-account',
      desc: 'Live company balances (cash, bank, and cheque) from profile accounting data.',
      balance: companySummary.grandTotal,
      color: 'from-emerald-500 to-teal-500',
    },
    {
      title: 'Cheque Registry',
      widgetKey: 'accounts-module-cheque-card',
      icon: '🧾',
      href: '/dashboard/accounts/cheque-registry',
      desc: 'Register received cheques, deposit, track distribution cheques, and issue supplier cheques.',
      balance: companySummary.totalCheque,
      color: 'from-fuchsia-500 to-rose-500',
    },
    {
      title: 'Advance Payments',
      widgetKey: 'accounts-module-advance-card',
      icon: '💸',
      href: '/dashboard/accounts/advance-payments',
      desc: 'Manage supplier, employee, travel, contractor, rent, insurance, utility, and customer advances.',
      balance: advanceNetBalance,
      color: 'from-cyan-500 to-blue-500',
    },
    
    {
      title: 'Petty Cash Account',
      widgetKey: 'accounts-module-petty-card',
      icon: '🧾',
      href: '/dashboard/accounts/petty-cash',
      desc: 'Small expense accounting and petty cash replenishment.',
      balance: pettyBalance,
      color: 'from-amber-500 to-orange-500',
    },
    {
      title: 'Delivery Cash Account',
      widgetKey: 'accounts-module-delivery-card',
      icon: '🚚',
      href: '/dashboard/accounts/delivery-cash',
      desc: 'Track delivery collections and settlement entries.',
      balance: deliveryBalance,
      color: 'from-violet-500 to-indigo-500',
    },
  ];

  if (!token || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {isWidgetVisible('accounts-nav-bar') && <nav className="bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Link href="/dashboard" className="flex items-center space-x-2 text-gray-700 hover:text-emerald-600">
                <span>←</span>
                <span className="font-medium text-sm sm:text-base">Back to Dashboard</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span>Accounts Active</span>
            </div>
          </div>
        </div>
        {!widgetControlsLocked && <div className="max-w-7xl mx-auto px-4 pb-3 sm:px-6 lg:px-8"><button type="button" onClick={() => stageWidgetVisibilityChange('accounts-nav-bar', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
      </nav>}

      <main className="w-full py-8 px-3 sm:px-4 lg:px-6 space-y-8">
        {isWidgetVisible('accounts-hero-card') && <div className="text-center">
          <div className="inline-block p-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full mb-4">
            <div className="bg-white rounded-full p-4 text-4xl">💼</div>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900">Accounts Management</h1>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 mt-2 px-2">Manage company account books, petty cash, and delivery collections.</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Live backend table data
          </div>
          {!widgetControlsLocked && <div className="mt-3"><button type="button" onClick={() => stageWidgetVisibilityChange('accounts-hero-card', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </div>}

        {isWidgetVisible('accounts-modules-grid') && <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.map((module) => {
            if (!isWidgetVisible(module.widgetKey)) return null;
            return (
            <Link
              key={module.title}
              href={module.href}
              className="group bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl border border-white/30 p-6 transition-all hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${module.color} text-white text-2xl flex items-center justify-center`}>{module.icon}</div>
                {!widgetControlsLocked && <button type="button" onClick={(e) => { e.preventDefault(); stageWidgetVisibilityChange(module.widgetKey, false); }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button>}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{module.desc}</p>
            </Link>
            );
          })}
          {!widgetControlsLocked && <div className="md:col-span-2"><button type="button" onClick={() => stageWidgetVisibilityChange('accounts-modules-grid', false)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">✕</button></div>}
        </div>}

      </main>
      {showSuperAdminConfirmModal && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4"><div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-base font-semibold text-slate-900">{superAdminModalMode === 'unlock' ? 'Unlock Widget Controls' : superAdminModalMode === 'restore' ? 'Restore Hidden Widgets' : 'Fix Widget Visibility'}</h3></div><div className="space-y-4 px-5 py-4"><div className="grid gap-3 md:grid-cols-2"><input type="email" value={superAdminEmail} onChange={(e) => setSuperAdminEmail(e.target.value)} placeholder="Super Admin Email" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /><input type="password" value={superAdminPassword} onChange={(e) => setSuperAdminPassword(e.target.value)} placeholder="Super Admin Password" className="rounded-lg border border-slate-300 p-2 text-sm text-slate-900" /></div>{superAdminModalMode === 'restore' && restoreWidgetListVisible && <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">{accountsWidgetItems.filter((item) => widgetVisibility[item.id] === false).map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2"><span className="text-sm text-slate-700">{item.name}</span><button type="button" onClick={() => restoreHiddenWidgetOneByOne(item.id)} disabled={restoreWidgetLoadingKey === item.id} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">{restoreWidgetLoadingKey === item.id ? 'Restoring...' : 'Restore'}</button></div>)}</div>}</div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={rollbackPendingWidgetChanges} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Cancel</button>{superAdminModalMode === 'restore' && <button type="button" onClick={showRestoreWidgetList} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={superAdminConfirmLoading}>Show Hidden Widgets</button>}<button type="button" onClick={superAdminModalMode === 'unlock' ? unlockWidgetControls : applyWidgetVisibilityChanges} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={superAdminConfirmLoading}>{superAdminConfirmLoading ? 'Processing...' : superAdminModalMode === 'unlock' ? 'Unlock Widgets' : superAdminModalMode === 'restore' ? 'Confirm Restore' : 'Confirm and Fix'}</button></div></div></div>}
    </div>
  );
}
