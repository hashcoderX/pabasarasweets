'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../../../lib/apiClient';

type OutletProfile = {
  id: number;
  name: string;
  code: string;
  manager_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: 'active' | 'inactive';
};

type OutletBalances = {
  cash: number;
  bank: number;
  cheque: number;
};

type JournalEntry = {
  id: string;
  date: string;
  entry_type: 'debit' | 'credit';
  status?: 'pending' | 'accepted' | 'completed';
  account: 'cash' | 'bank' | 'cheque';
  account_label: string;
  company_name: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  debit_amount: number;
  credit_amount: number;
  balance: number;
  total_balance: number;
  reference: string;
  note: string;
};

type PendingFundRequest = {
  id: string;
  date: string;
  status: 'pending';
  account: 'cash' | 'bank' | 'cheque';
  account_label: string;
  source_company_name: string;
  outlet_name: string;
  source_account: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  debit_amount: number;
  credit_amount: number;
  reference: string;
  note: string;
};

type OutletJournalRow = {
  id: string;
  date: string;
  entry_type: 'debit' | 'credit';
  status: 'pending' | 'accepted' | 'completed';
  company_name: string;
  debit_account: string;
  debit_amount: number;
  credit_account: string;
  credit_amount: number;
  balance?: number;
  total_balance?: number;
  reference: string;
  pendingAccount?: 'cash' | 'bank' | 'cheque';
};

type OutletApiResponse = {
  success?: boolean;
  data?: OutletProfile;
};

type CompanyProfile = {
  id: number;
  name: string;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
};

const JOURNAL_PAGE_SIZE = 10;

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toAccountLabel = (account: 'cash' | 'bank' | 'cheque') => {
  if (account === 'cash') return 'Outlet Cash';
  if (account === 'bank') return 'Outlet Bank';
  return 'Outlet Cheque';
};

export default function OutletAccountPage() {
  const router = useRouter();
  const params = useParams<{ outletId: string }>();
  const outletId = String(params?.outletId || '');

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [outlet, setOutlet] = useState<OutletProfile | null>(null);
  const [companies, setCompanies] = useState<CompanyProfile[]>([]);
  const [balances, setBalances] = useState<OutletBalances>({ cash: 0, bank: 0, cheque: 0 });
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [pendingFunds, setPendingFunds] = useState<PendingFundRequest[]>([]);
  const [journalPage, setJournalPage] = useState(1);
  const [storageReady, setStorageReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    entryType: 'debit' as 'debit' | 'credit',
    account: 'cash' as 'cash' | 'bank' | 'cheque',
    amount: '',
    reference: '',
    note: '',
  });
  const [sendMainForm, setSendMainForm] = useState({
    companyId: '',
    targetAccount: 'cash' as 'cash' | 'bank' | 'cheque',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
  });

  const api = useMemo(() => createApiClient(token), [token]);

  const balanceStorageKey = useMemo(() => `outlet_account_balances_${outletId}`, [outletId]);
  const journalStorageKey = useMemo(() => `outlet_account_journal_${outletId}`, [outletId]);
  const pendingFundsStorageKey = useMemo(() => `outlet_account_pending_funds_${outletId}`, [outletId]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }
    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token || !outletId) return;

    const loadOutlet = async () => {
      try {
        setLoading(true);
        const response = await api.get<OutletApiResponse>(`/outlets/${outletId}`);
        const resolvedOutlet = response.data?.data || null;

        if (!resolvedOutlet) {
          setOutlet(null);
          setErrorMessage('Outlet not found.');
          return;
        }

        setOutlet(resolvedOutlet);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }
        console.error('Failed to load outlet profile:', error);
        setOutlet(null);
        setErrorMessage('Failed to load outlet profile.');
      } finally {
        setLoading(false);
      }
    };

    loadOutlet();
  }, [token, outletId, api, router]);

  useEffect(() => {
    if (!token) return;

    const loadCompanies = async () => {
      try {
        const response = await api.get('/companies');
        const data = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        setCompanies(Array.isArray(data) ? data : []);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }
        console.error('Failed to load companies for outbound transfer:', error);
        setCompanies([]);
      }
    };

    loadCompanies();
  }, [token, api, router]);

  useEffect(() => {
    if (!companies.length) return;
    setSendMainForm((prev) => {
      if (prev.companyId) return prev;
      return {
        ...prev,
        companyId: String(companies[0].id),
      };
    });
  }, [companies]);

  useEffect(() => {
    if (!outletId) return;

    try {
      const rawBalances = localStorage.getItem(balanceStorageKey);
      const parsedBalances = rawBalances ? JSON.parse(rawBalances) : null;
      const nextBalances: OutletBalances = {
        cash: Number(parsedBalances?.cash || 0),
        bank: Number(parsedBalances?.bank || 0),
        cheque: Number(parsedBalances?.cheque || 0),
      };
      setBalances(nextBalances);

      const rawJournal = localStorage.getItem(journalStorageKey);
      const parsedJournal = rawJournal ? JSON.parse(rawJournal) : [];
      setJournalEntries(Array.isArray(parsedJournal) ? parsedJournal : []);

      const rawPendingFunds = localStorage.getItem(pendingFundsStorageKey);
      const parsedPendingFunds = rawPendingFunds ? JSON.parse(rawPendingFunds) : [];
      setPendingFunds(Array.isArray(parsedPendingFunds) ? parsedPendingFunds : []);
    } catch (error) {
      console.error('Failed to load outlet account storage:', error);
      setBalances({ cash: 0, bank: 0, cheque: 0 });
      setJournalEntries([]);
      setPendingFunds([]);
    } finally {
      setStorageReady(true);
    }
  }, [outletId, balanceStorageKey, journalStorageKey, pendingFundsStorageKey]);

  useEffect(() => {
    if (!storageReady || !outletId) return;
    localStorage.setItem(balanceStorageKey, JSON.stringify(balances));
  }, [balances, storageReady, outletId, balanceStorageKey]);

  useEffect(() => {
    if (!storageReady || !outletId) return;
    localStorage.setItem(journalStorageKey, JSON.stringify(journalEntries));
  }, [journalEntries, storageReady, outletId, journalStorageKey]);

  useEffect(() => {
    if (!storageReady || !outletId) return;
    localStorage.setItem(pendingFundsStorageKey, JSON.stringify(pendingFunds));
  }, [pendingFunds, storageReady, outletId, pendingFundsStorageKey]);

  const summary = useMemo(() => {
    const totalCash = Number(balances.cash || 0);
    const totalBank = Number(balances.bank || 0);
    const totalCheque = Number(balances.cheque || 0);
    return {
      totalCash,
      totalBank,
      totalCheque,
      grandTotal: totalCash + totalBank + totalCheque,
    };
  }, [balances]);

  const journalRows = useMemo<OutletJournalRow[]>(() => {
    const pendingRows: OutletJournalRow[] = pendingFunds.map((entry) => ({
      id: entry.id,
      date: entry.date,
      entry_type: 'debit',
      status: 'pending',
      company_name: entry.source_company_name,
      debit_account: entry.debit_account,
      debit_amount: Number(entry.amount || 0),
      credit_account: entry.credit_account,
      credit_amount: Number(entry.amount || 0),
      reference: entry.reference,
      pendingAccount: entry.account,
    }));

    const acceptedRows: OutletJournalRow[] = journalEntries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      entry_type: entry.entry_type,
      status: entry.status || 'completed',
      company_name: entry.company_name,
      debit_account: entry.debit_account,
      debit_amount: Number(entry.debit_amount || 0),
      credit_account: entry.credit_account,
      credit_amount: Number(entry.credit_amount || 0),
      balance: entry.balance,
      total_balance: entry.total_balance,
      reference: entry.reference,
    }));

    return [...pendingRows, ...acceptedRows].sort((a, b) => {
      const at = new Date(a.date).getTime();
      const bt = new Date(b.date).getTime();
      return bt - at;
    });
  }, [pendingFunds, journalEntries]);

  const totalJournalPages = useMemo(
    () => Math.max(1, Math.ceil(journalRows.length / JOURNAL_PAGE_SIZE)),
    [journalRows.length]
  );

  const currentJournalPage = useMemo(
    () => Math.min(journalPage, totalJournalPages),
    [journalPage, totalJournalPages]
  );

  const paginatedEntries = useMemo(() => {
    const start = (currentJournalPage - 1) * JOURNAL_PAGE_SIZE;
    return journalRows.slice(start, start + JOURNAL_PAGE_SIZE);
  }, [journalRows, currentJournalPage]);

  const journalRangeStart = journalRows.length === 0 ? 0 : (currentJournalPage - 1) * JOURNAL_PAGE_SIZE + 1;
  const journalRangeEnd = Math.min(currentJournalPage * JOURNAL_PAGE_SIZE, journalRows.length);

  useEffect(() => {
    setJournalPage((prev) => Math.min(prev, totalJournalPages));
  }, [totalJournalPages]);

  const handlePostTransaction = () => {
    setErrorMessage('');
    setSuccessMessage('');

    const amount = Number(form.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      setErrorMessage('Amount must be greater than zero.');
      return;
    }

    const account = form.account;
    const previousBalance = Number(balances[account] || 0);

    if (form.entryType === 'credit' && previousBalance < amount) {
      setErrorMessage(`Insufficient ${account} balance for this credit entry.`);
      return;
    }

    try {
      setPosting(true);
      const nextAccountBalance = form.entryType === 'debit' ? previousBalance + amount : previousBalance - amount;
      const nextBalances: OutletBalances = {
        ...balances,
        [account]: nextAccountBalance,
      };

      const accountLabel = toAccountLabel(account);
      const reference = form.reference.trim() || `${form.entryType === 'debit' ? 'DR' : 'CR'}-${Date.now()}`;
      const note = form.note.trim() ||
        (form.entryType === 'debit'
          ? `Debit posted to ${accountLabel}`
          : `Credit posted from ${accountLabel}`);

      const nextTotalBalance = nextBalances.cash + nextBalances.bank + nextBalances.cheque;

      const entry: JournalEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: form.date,
        entry_type: form.entryType,
        status: 'completed',
        account,
        account_label: accountLabel,
        company_name: outlet?.name || `Outlet #${outletId}`,
        debit_account: form.entryType === 'debit' ? accountLabel : 'Adjustment Account',
        credit_account: form.entryType === 'credit' ? accountLabel : 'Adjustment Account',
        amount,
        debit_amount: form.entryType === 'debit' ? amount : 0,
        credit_amount: form.entryType === 'credit' ? amount : 0,
        balance: nextAccountBalance,
        total_balance: nextTotalBalance,
        reference,
        note,
      };

      setBalances(nextBalances);
      setJournalEntries((prev) => [entry, ...prev]);
      setJournalPage(1);

      setForm((prev) => ({
        ...prev,
        amount: '',
        reference: '',
        note: '',
      }));

      setSuccessMessage('Outlet transaction posted successfully.');
    } finally {
      setPosting(false);
    }
  };

  const handleAcceptPendingFund = (requestId: string) => {
    setErrorMessage('');
    setSuccessMessage('');

    const pending = pendingFunds.find((entry) => entry.id === requestId);
    if (!pending) {
      setErrorMessage('Pending request not found.');
      return;
    }

    const amount = Number(pending.amount || 0);
    const account = pending.account;
    const nextAccountBalance = Number(balances[account] || 0) + amount;
    const nextBalances: OutletBalances = {
      ...balances,
      [account]: nextAccountBalance,
    };

    const nextTotalBalance = nextBalances.cash + nextBalances.bank + nextBalances.cheque;

    const acceptedEntry: JournalEntry = {
      id: pending.id,
      date: pending.date,
      entry_type: 'debit',
      status: 'accepted',
      account,
      account_label: pending.account_label,
      company_name: pending.outlet_name || outlet?.name || `Outlet #${outletId}`,
      debit_account: pending.debit_account,
      credit_account: pending.credit_account,
      amount,
      debit_amount: amount,
      credit_amount: amount,
      balance: nextAccountBalance,
      total_balance: nextTotalBalance,
      reference: pending.reference,
      note: pending.note || `Fund accepted from ${pending.source_company_name}`,
    };

    const nextJournal = [acceptedEntry, ...journalEntries];
    const nextPendingFunds = pendingFunds.filter((entry) => entry.id !== requestId);

    setBalances(nextBalances);
    setJournalEntries(nextJournal);
    setPendingFunds(nextPendingFunds);
    setJournalPage(1);

    try {
      const mainJournalRaw = localStorage.getItem('accounts_internal_transfer_journal');
      const mainJournalParsed = mainJournalRaw ? JSON.parse(mainJournalRaw) : [];
      const nextMainJournal = Array.isArray(mainJournalParsed)
        ? mainJournalParsed.map((entry) =>
            entry?.id === requestId ? { ...entry, status: 'accepted' } : entry
          )
        : [];
      localStorage.setItem('accounts_internal_transfer_journal', JSON.stringify(nextMainJournal));
    } catch (error) {
      console.error('Failed to sync main transfer journal status:', error);
    }

    setSuccessMessage('Fund accepted and outlet account updated successfully.');
  };

  const handleSendFundToMain = () => {
    setErrorMessage('');
    setSuccessMessage('');

    const targetCompany = companies.find((company) => String(company.id) === sendMainForm.companyId);
    if (!targetCompany) {
      setErrorMessage('Please select the target main company account.');
      return;
    }

    const amount = Number(sendMainForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      setErrorMessage('Amount must be greater than zero.');
      return;
    }

    const sourceBalance = Number(balances[sendMainForm.targetAccount] || 0);
    if (sourceBalance < amount) {
      setErrorMessage(`Insufficient outlet ${sendMainForm.targetAccount} balance for this transfer.`);
      return;
    }

    const targetAccountLabel =
      sendMainForm.targetAccount === 'cash'
        ? 'Main Cash Account'
        : sendMainForm.targetAccount === 'bank'
          ? 'Main Bank Account'
          : 'Main Cheque Account';

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const reference = sendMainForm.reference.trim() || `OTM-${Date.now()}`;
    const note = sendMainForm.note.trim();

    const pendingRequest = {
      id: requestId,
      date: sendMainForm.date,
      status: 'pending' as const,
      outlet_id: Number(outletId),
      outlet_name: outlet?.name || `Outlet #${outletId}`,
      company_id: targetCompany.id,
      company_name: targetCompany.name,
      target_account: sendMainForm.targetAccount,
      target_account_label: targetAccountLabel,
      amount,
      reference,
      note: note || `Pending transfer from outlet ${outlet?.name || outletId} to ${targetCompany.name}`,
    };

    const existingPendingRequests = (() => {
      try {
        const raw = localStorage.getItem('main_account_pending_fund_requests');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();

    localStorage.setItem(
      'main_account_pending_fund_requests',
      JSON.stringify([pendingRequest, ...existingPendingRequests])
    );

    const nextBalances: OutletBalances = {
      ...balances,
      [sendMainForm.targetAccount]: sourceBalance - amount,
    };

    const nextTotalBalance = nextBalances.cash + nextBalances.bank + nextBalances.cheque;

    const sourceAccountLabel = toAccountLabel(sendMainForm.targetAccount);
    const sentEntry: JournalEntry = {
      id: requestId,
      date: sendMainForm.date,
      entry_type: 'credit',
      status: 'pending',
      account: sendMainForm.targetAccount,
      account_label: sourceAccountLabel,
      company_name: outlet?.name || `Outlet #${outletId}`,
      debit_account: targetAccountLabel,
      credit_account: sourceAccountLabel,
      amount,
      debit_amount: amount,
      credit_amount: amount,
      balance: Number(nextBalances[sendMainForm.targetAccount] || 0),
      total_balance: nextTotalBalance,
      reference,
      note: note || `Transfer sent to main account ${targetCompany.name}. Awaiting acceptance.`,
    };

    setBalances(nextBalances);
    setJournalEntries((prev) => [sentEntry, ...prev]);
    setJournalPage(1);

    setSendMainForm((prev) => ({
      ...prev,
      amount: '',
      reference: '',
      note: '',
    }));

    setSuccessMessage('Transfer sent to main account as pending. Main account must accept it.');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-violet-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(45,212,191,0.15),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_24%),linear-gradient(180deg,_#f7fbff_0%,_#f3f8ff_45%,_#edf5ff_100%)]">
      <nav className="border-b border-white/60 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Outlet Account</h1>
            <p className="text-xs text-slate-500">Separate transaction management for each outlet</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard/outlets/management')}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            >
              Back to Management
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_-40px_rgba(2,132,199,0.35)] backdrop-blur-xl">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-sm font-semibold text-teal-700">
                <span className="h-2 w-2 rounded-full bg-teal-500"></span>
                Outlet account workspace
              </div>
              <h2 className="mt-4 text-3xl font-bold text-slate-900">{outlet?.name || `Outlet #${outletId}`}</h2>
              <p className="mt-2 text-sm text-slate-600">
                Code: <span className="font-semibold text-slate-800">{outlet?.code || '-'}</span> | Status:{' '}
                <span className="font-semibold text-slate-800">{outlet?.status || '-'}</span>
              </p>
              <p className="mt-3 max-w-2xl text-sm text-slate-600">
                Transactions posted on this page stay under this outlet only and do not mix with main company account journals.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-3xl border border-teal-300/70 bg-gradient-to-br from-teal-500 to-cyan-500 p-5 text-white shadow-lg shadow-teal-300/40">
                <p className="text-xs uppercase tracking-[0.2em] text-white/80">Grand Total</p>
                <p className="mt-2 text-3xl font-bold">{money(summary.grandTotal)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Transactions</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{journalRows.length}</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-emerald-700">Outlet Cash</p>
            <p className="text-2xl font-bold text-emerald-800">{money(summary.totalCash)}</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-sky-700">Outlet Bank</p>
            <p className="text-2xl font-bold text-sky-800">{money(summary.totalBank)}</p>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-violet-700">Outlet Cheque</p>
            <p className="text-2xl font-bold text-violet-800">{money(summary.totalCheque)}</p>
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-cyan-700">Grand Total</p>
            <p className="text-2xl font-bold text-cyan-800">{money(summary.grandTotal)}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] backdrop-blur-lg">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Post Outlet Transaction</h3>
            <p className="mt-1 text-sm text-gray-600">Use debit to increase selected outlet account and credit to reduce it.</p>
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <select
              value={form.entryType}
              onChange={(e) => setForm((prev) => ({ ...prev, entryType: e.target.value as 'debit' | 'credit' }))}
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            >
              <option value="debit">Debit (Increase)</option>
              <option value="credit">Credit (Decrease)</option>
            </select>

            <select
              value={form.account}
              onChange={(e) => setForm((prev) => ({ ...prev, account: e.target.value as 'cash' | 'bank' | 'cheque' }))}
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            >
              <option value="cash">Outlet Cash</option>
              <option value="bank">Outlet Bank</option>
              <option value="cheque">Outlet Cheque</option>
            </select>

            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            />

            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            />

            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Narration"
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm md:col-span-4"
            />

            <button
              type="button"
              onClick={handlePostTransaction}
              disabled={posting}
              className="rounded-full bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-teal-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {posting ? 'Posting...' : 'Post Transaction'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-[0_18px_65px_-35px_rgba(6,182,212,0.45)] backdrop-blur-lg">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Send Fund to Main Account</h3>
            <p className="mt-1 text-sm text-gray-600">Sends transfer request as pending. Main account must accept before receipt is posted.</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-6">
            <select
              value={sendMainForm.companyId}
              onChange={(e) => setSendMainForm((prev) => ({ ...prev, companyId: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm md:col-span-2"
            >
              <option value="">Select Main Company</option>
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>

            <select
              value={sendMainForm.targetAccount}
              onChange={(e) =>
                setSendMainForm((prev) => ({
                  ...prev,
                  targetAccount: e.target.value as 'cash' | 'bank' | 'cheque',
                }))
              }
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            >
              <option value="cash">Send from Outlet Cash</option>
              <option value="bank">Send from Outlet Bank</option>
              <option value="cheque">Send from Outlet Cheque</option>
            </select>

            <input
              type="date"
              value={sendMainForm.date}
              onChange={(e) => setSendMainForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={sendMainForm.amount}
              onChange={(e) => setSendMainForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            />

            <input
              type="text"
              value={sendMainForm.reference}
              onChange={(e) => setSendMainForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
            />

            <input
              type="text"
              value={sendMainForm.note}
              onChange={(e) => setSendMainForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Narration"
              className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm md:col-span-5"
            />

            <button
              type="button"
              onClick={handleSendFundToMain}
              className="rounded-full bg-gradient-to-r from-cyan-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-cyan-700 hover:to-sky-700"
            >
              Send to Main (Pending)
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] backdrop-blur-lg">
          <div className="border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-teal-50 px-5 py-4">
            <h3 className="text-base font-semibold text-gray-900">Outlet Transaction Journal</h3>
            <p className="mt-1 text-xs text-gray-600">Debit/Credit postings with account-wise and total running balances.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] divide-y divide-gray-200">
              <thead className="bg-slate-100/90">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Outlet</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Debit Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Credit Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Acct. Balance</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {journalRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500">No outlet journal entries yet.</td>
                  </tr>
                ) : (
                  paginatedEntries.map((entry, idx) => (
                    <tr key={entry.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'} transition hover:bg-cyan-50/35`}>
                      <td className="px-4 py-3 text-sm text-gray-700">{new Date(entry.date).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm capitalize text-gray-700">{entry.entry_type}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{entry.company_name}</td>
                      <td className="px-4 py-3 text-sm text-emerald-700">{entry.debit_account}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">{money(entry.debit_amount)}</td>
                      <td className="px-4 py-3 text-sm text-rose-700">{entry.credit_account}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-rose-700">{money(entry.credit_amount)}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-sky-700">{typeof entry.balance === 'number' ? money(entry.balance) : '-'}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-cyan-700">{typeof entry.total_balance === 'number' ? money(entry.total_balance) : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            entry.status === 'pending'
                              ? 'bg-amber-100 text-amber-700'
                              : entry.status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <span>{entry.reference || '-'}</span>
                          {entry.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => handleAcceptPendingFund(entry.id)}
                              className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-200"
                            >
                              Accept Fund
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 bg-white/80 px-5 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {journalRangeStart}-{journalRangeEnd} of {journalRows.length} entries
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setJournalPage((prev) => Math.max(1, prev - 1))}
                disabled={currentJournalPage === 1 || journalRows.length === 0}
                className="rounded-full border border-gray-300 px-4 py-1.5 font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold text-gray-700">
                Page {currentJournalPage} of {totalJournalPages}
              </span>
              <button
                type="button"
                onClick={() => setJournalPage((prev) => Math.min(totalJournalPages, prev + 1))}
                disabled={currentJournalPage === totalJournalPages || journalRows.length === 0}
                className="rounded-full border border-gray-300 px-4 py-1.5 font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
