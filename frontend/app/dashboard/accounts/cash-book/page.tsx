'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../../lib/apiClient';

type CompanyAccountEntry = {
  id: number;
  bank_name?: string;
  account_no?: string;
  current_balance?: number;
};

type CompanyProfile = {
  id: number;
  name: string;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
  bank_accounts?: CompanyAccountEntry[];
};

type MainCashTransactionRow = {
  id: number | string;
  date: string;
  created_at?: string | null;
  type: 'in' | 'out';
  amount: number | string;
  reference?: string | null;
  note?: string | null;
};

type JournalEntry = {
  id: string;
  date: string;
  posted_at?: string;
  entry_type?: 'transfer' | 'withdrawal';
  status?: 'pending' | 'accepted' | 'completed';
  company_name: string;
  source_account: string;
  target_account: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  debit_amount?: number;
  credit_amount?: number;
  reference: string;
  note: string;
};

type PendingMainFundRequest = {
  id: string;
  date: string;
  status: 'pending';
  outlet_name: string;
  company_name: string;
  target_account_label: string;
  amount: number;
  reference: string;
  note: string;
};

type MainJournalRow = JournalEntry & {
  row_source?: 'main' | 'outlet_request';
};

type JournalUiRow = MainJournalRow & {
  txMark: 'Transfer In' | 'Transfer Out' | 'Pending Receipt' | 'Withdrawal' | 'Transfer' | 'Cheque Deposit' | 'Cheque Return';
  accountMark: 'Cash' | 'Bank' | 'Cheque' | 'Mixed';
  runningBalance: number;
  balanceLabel: string;
  displayDebitAccount: string;
  displayCreditAccount: string;
  displayDebitAmount: number;
  displayCreditAmount: number;
};

const JOURNAL_PAGE_SIZE = 10;

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const parseJournalDate = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatJournalDateTime = (postedAt?: string, dateValue?: string) => {
  const parsed = parseJournalDate(postedAt) || parseJournalDate(dateValue);
  if (!parsed) return '-';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
};

export default function CashBookPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CompanyProfile[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [pendingMainFundRequests, setPendingMainFundRequests] = useState<PendingMainFundRequest[]>([]);
  const [journalPage, setJournalPage] = useState(1);
  const [journalFilters, setJournalFilters] = useState({
    entryType: 'all',
    txMark: 'all',
    accountMark: 'all',
    status: 'all',
    fromDate: '',
    toDate: '',
    search: '',
  });

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);

  const detectEntryType = (reference?: string | null, note?: string | null): 'transfer' | 'withdrawal' | null => {
    const ref = String(reference || '').toLowerCase();
    const narration = String(note || '').toLowerCase();

    if (ref.startsWith('chq-')) {
      return ref.startsWith('chq-ret-') ? 'withdrawal' : 'transfer';
    }

    if (ref.startsWith('trf-') || narration.includes('transfer')) {
      return 'transfer';
    }

    if (ref.startsWith('wdr-') || narration.includes('withdraw')) {
      return 'withdrawal';
    }

    return null;
  };

  const extractDebitCredit = (note: string | null | undefined, fallbackType: 'in' | 'out') => {
    const narration = String(note || '');
    const match = narration.match(/Dr\s+([^,]+),\s*Cr\s+([^\.\n]+)/i);

    if (match) {
      return {
        debit: match[1].trim(),
        credit: match[2].trim(),
      };
    }

    if (fallbackType === 'in') {
      return {
        debit: 'Main Cash Account',
        credit: 'External Source',
      };
    }

    return {
      debit: 'Transfer / Withdrawal Expense',
      credit: 'Main Cash Account',
    };
  };

  const mapTransactionToJournal = (row: MainCashTransactionRow): JournalEntry | null => {
    const entryType = detectEntryType(row.reference, row.note);
    if (!entryType) return null;

    const amount = Number(row.amount || 0);
    const { debit, credit } = extractDebitCredit(row.note, row.type);

    return {
      id: `main-tx-${row.id}`,
      date: row.date,
      posted_at: String(row.created_at || row.date || ''),
      entry_type: entryType,
      status: 'completed',
      company_name: 'Main Account',
      source_account: credit,
      target_account: debit,
      debit_account: debit,
      credit_account: credit,
      amount,
      debit_amount: amount,
      credit_amount: amount,
      reference: String(row.reference || '-'),
      note: String(row.note || ''),
    };
  };

  const getTxMark = (entry: MainJournalRow): JournalUiRow['txMark'] => {
    const reference = String(entry.reference || '').toLowerCase();
    const narration = String(entry.note || '').toLowerCase();

    if (entry.status === 'pending' && entry.row_source === 'outlet_request') {
      return 'Pending Receipt';
    }

    if (entry.entry_type === 'withdrawal') {
      return 'Withdrawal';
    }

    if (reference.startsWith('chq-ret-') || narration.includes('cheque return')) {
      return 'Cheque Return';
    }

    if (
      reference.startsWith('chq-dep-') ||
      reference.startsWith('chq-endclr-') ||
      narration.includes('cheque deposit') ||
      narration.includes('end cheque clearance')
    ) {
      return 'Cheque Deposit';
    }

    if (narration.includes('transfer received') || String(entry.source_account || '').toLowerCase().includes('outlet')) {
      return 'Transfer In';
    }

    if (narration.includes('transfer issued')) {
      return 'Transfer Out';
    }

    return 'Transfer';
  };

  const getAccountMark = (entry: MainJournalRow): JournalUiRow['accountMark'] => {
    const tagText = [
      entry.source_account,
      entry.target_account,
      entry.debit_account,
      entry.credit_account,
      entry.note,
    ]
      .join(' ')
      .toLowerCase();

    const hasCash = tagText.includes('cash');
    const hasBank = tagText.includes('bank');
    const hasCheque = tagText.includes('cheque') || tagText.includes('check');

    const marks = [hasCash, hasBank, hasCheque].filter(Boolean).length;

    if (marks > 1) return 'Mixed';
    if (hasCheque) return 'Cheque';
    if (hasBank) return 'Bank';
    return 'Cash';
  };

  const extractBankLabel = (entry: MainJournalRow): string | null => {
    const fields = [
      String(entry.source_account || ''),
      String(entry.target_account || ''),
      String(entry.debit_account || ''),
      String(entry.credit_account || ''),
      String(entry.note || ''),
    ];

    for (const field of fields) {
      const match = field.match(/Bank\s*-\s*([^,\.\n]+)/i);
      if (match?.[1]) {
        return `Bank - ${match[1].trim()}`;
      }

      const alt = field.match(/Bank\s*:\s*([^|,\.\n]+)/i);
      if (alt?.[1]) {
        return `Bank - ${alt[1].trim()}`;
      }
    }

    return null;
  };

  const affectsMainCash = (entry: MainJournalRow): boolean => {
    const text = [
      entry.source_account,
      entry.target_account,
      entry.debit_account,
      entry.credit_account,
      entry.note,
    ]
      .join(' ')
      .toLowerCase();

    return text.includes('cash');
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        const [companiesRes, journalRes] = await Promise.all([
          api.get('/companies'),
          api.get('/main-cash-transactions', { params: { per_page: 500 } }),
        ]);

        const companiesData = Array.isArray(companiesRes.data)
          ? companiesRes.data
          : (companiesRes.data?.data || []);
        setRows(Array.isArray(companiesData) ? companiesData : []);

        const payload = journalRes.data;
        const txRows = Array.isArray(payload)
          ? payload
          : (payload?.data?.data || payload?.data || []);

        const mapped = (Array.isArray(txRows) ? txRows : [])
          .map((row) => mapTransactionToJournal(row as MainCashTransactionRow))
          .filter((row): row is JournalEntry => Boolean(row));

        setJournalEntries(mapped);
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }
        console.error('Error loading cash-book journal:', error);
        setRows([]);
        setJournalEntries([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, api, router]);

  useEffect(() => {
    const raw = localStorage.getItem('main_account_pending_fund_requests');
    if (!raw) {
      setPendingMainFundRequests([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setPendingMainFundRequests(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      console.error('Failed to parse pending main fund requests:', error);
      setPendingMainFundRequests([]);
    }
  }, []);

  const summary = useMemo(() => {
    const totalCash = rows.reduce((sum, company) => sum + Number(company.current_cash_balance || 0), 0);
    return { totalCash };
  }, [rows]);

  const currentBankBalancesByLabel = useMemo<Record<string, number>>(() => {
    const balances: Record<string, number> = {};

    rows.forEach((company) => {
      (company.bank_accounts || []).forEach((account) => {
        const label = `Bank - ${account.bank_name || 'Account'}`;
        balances[label] = Number(balances[label] || 0) + Number(account.current_balance || 0);
      });
    });

    return balances;
  }, [rows]);

  const journalRows = useMemo<JournalUiRow[]>(() => {
    const pendingRows: MainJournalRow[] = pendingMainFundRequests.map((request) => ({
      id: request.id,
      date: request.date,
      entry_type: 'transfer',
      status: 'pending',
      company_name: request.company_name,
      source_account: `Outlet - ${request.outlet_name}`,
      target_account: request.target_account_label,
      debit_account: request.target_account_label,
      credit_account: `Outlet - ${request.outlet_name}`,
      amount: Number(request.amount || 0),
      debit_amount: Number(request.amount || 0),
      credit_amount: Number(request.amount || 0),
      reference: request.reference,
      note: request.note || `Pending receipt from outlet ${request.outlet_name}`,
      row_source: 'outlet_request',
    }));

    const ownRows: MainJournalRow[] = journalEntries.map((entry) => ({
      ...entry,
      row_source: 'main',
    }));

    const combined = [...pendingRows, ...ownRows].sort((a, b) => {
      const at = new Date(a.date).getTime();
      const bt = new Date(b.date).getTime();
      return bt - at;
    });

    let currentBalance = Number(summary.totalCash || 0);
    const bankBalances = { ...currentBankBalancesByLabel };

    return combined.map((entry) => {
      const amount = Number(entry.amount || 0);
      const txMark = getTxMark(entry);
      const shouldFlipTransferSides = txMark === 'Transfer Out';

      const defaultDebitAccount = String(entry.debit_account || '-');
      const defaultCreditAccount = String(entry.credit_account || '-');
      const defaultDebitAmount = Number(entry.debit_amount ?? amount);
      const defaultCreditAmount = Number(entry.credit_amount ?? amount);

      const mapped: JournalUiRow = {
        ...entry,
        txMark,
        accountMark: getAccountMark(entry),
        runningBalance: currentBalance,
        balanceLabel: 'Main Cash',
        displayDebitAccount: shouldFlipTransferSides ? defaultCreditAccount : defaultDebitAccount,
        displayCreditAccount: shouldFlipTransferSides ? defaultDebitAccount : defaultCreditAccount,
        displayDebitAmount: shouldFlipTransferSides ? defaultCreditAmount : defaultDebitAmount,
        displayCreditAmount: shouldFlipTransferSides ? defaultDebitAmount : defaultCreditAmount,
      };

      const bankLabel = extractBankLabel(entry);
      if (bankLabel) {
        mapped.balanceLabel = bankLabel;
        mapped.runningBalance = Number(bankBalances[bankLabel] || 0);
      } else {
        mapped.balanceLabel = 'Main Cash';
        mapped.runningBalance = currentBalance;
      }

      if (entry.status !== 'pending' && affectsMainCash(entry)) {
        if (mapped.txMark === 'Transfer In' || mapped.txMark === 'Cheque Deposit') {
          currentBalance -= amount;
        } else if (mapped.txMark === 'Transfer Out' || mapped.txMark === 'Withdrawal' || mapped.txMark === 'Cheque Return') {
          currentBalance += amount;
        }
      }

      if (entry.status !== 'pending' && bankLabel) {
        if (mapped.txMark === 'Transfer In' || mapped.txMark === 'Cheque Deposit') {
          bankBalances[bankLabel] = Number(bankBalances[bankLabel] || 0) - amount;
        } else if (mapped.txMark === 'Transfer Out' || mapped.txMark === 'Withdrawal' || mapped.txMark === 'Cheque Return') {
          bankBalances[bankLabel] = Number(bankBalances[bankLabel] || 0) + amount;
        }
      }

      return mapped;
    });
  }, [pendingMainFundRequests, journalEntries, summary.totalCash, currentBankBalancesByLabel]);

  const filteredJournalRows = useMemo(() => {
    const searchText = journalFilters.search.trim().toLowerCase();
    const fromAt = journalFilters.fromDate ? new Date(`${journalFilters.fromDate}T00:00:00`).getTime() : null;
    const toAt = journalFilters.toDate ? new Date(`${journalFilters.toDate}T23:59:59`).getTime() : null;

    return journalRows.filter((entry) => {
      const entryType = String(entry.entry_type || 'transfer');
      const entryStatus = String(entry.status || 'completed');
      const accountText = [
        entry.debit_account,
        entry.credit_account,
        entry.source_account,
        entry.target_account,
        entry.balanceLabel,
        entry.note,
      ]
        .join(' ')
        .toLowerCase();

      if (journalFilters.entryType !== 'all' && entryType !== journalFilters.entryType) return false;
      if (journalFilters.txMark !== 'all' && entry.txMark !== journalFilters.txMark) return false;

      if (journalFilters.accountMark !== 'all') {
        if (journalFilters.accountMark === 'Bank' && !accountText.includes('bank')) return false;
        if (journalFilters.accountMark === 'Cash' && !accountText.includes('cash')) return false;
        if (journalFilters.accountMark === 'Cheque' && !(accountText.includes('cheque') || accountText.includes('check'))) return false;
        if (journalFilters.accountMark === 'Mixed' && entry.accountMark !== 'Mixed') return false;
      }

      if (journalFilters.status !== 'all' && entryStatus !== journalFilters.status) return false;

      if (fromAt !== null || toAt !== null) {
        const parsedDate = parseJournalDate(entry.posted_at) || parseJournalDate(entry.date);
        if (!parsedDate) return false;
        const entryAt = parsedDate.getTime();
        if (fromAt !== null && entryAt < fromAt) return false;
        if (toAt !== null && entryAt > toAt) return false;
      }

      if (searchText) {
        const haystack = [
          entry.reference,
          entry.note,
          entry.company_name,
          entry.debit_account,
          entry.credit_account,
          entry.balanceLabel,
          entry.txMark,
          entry.accountMark,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(searchText)) return false;
      }

      return true;
    });
  }, [journalRows, journalFilters]);

  const totalJournalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredJournalRows.length / JOURNAL_PAGE_SIZE)),
    [filteredJournalRows.length]
  );

  const currentJournalPage = useMemo(
    () => Math.min(journalPage, totalJournalPages),
    [journalPage, totalJournalPages]
  );

  const paginatedJournalEntries = useMemo(() => {
    const start = (currentJournalPage - 1) * JOURNAL_PAGE_SIZE;
    return filteredJournalRows.slice(start, start + JOURNAL_PAGE_SIZE);
  }, [filteredJournalRows, currentJournalPage]);

  const journalRangeStart = filteredJournalRows.length === 0 ? 0 : (currentJournalPage - 1) * JOURNAL_PAGE_SIZE + 1;
  const journalRangeEnd = Math.min(currentJournalPage * JOURNAL_PAGE_SIZE, filteredJournalRows.length);

  useEffect(() => {
    setJournalPage((prev) => Math.min(prev, totalJournalPages));
  }, [totalJournalPages]);

  useEffect(() => {
    setJournalPage(1);
  }, [journalFilters]);

  if (!token || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.2),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(180deg,_#f0f9ff_0%,_#ecfeff_48%,_#f0fdfa_100%)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-600"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.2),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_30%),linear-gradient(180deg,_#f0f9ff_0%,_#ecfeff_48%,_#f0fdfa_100%)]">
      <nav className="relative z-10 bg-white/75 backdrop-blur-xl shadow-lg border-b border-white/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <Link href="/dashboard/accounts" className="flex items-center space-x-2 text-gray-700 hover:text-sky-600">
              <span>←</span>
              <span className="font-medium text-sm sm:text-base">Back to Accounts</span>
            </Link>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse"></div>
              <span>Cash Book Journal</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-7">
        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
            <h2 className="text-base font-semibold text-gray-900">Transfer and Withdrawal Journal</h2>
            <p className="text-xs text-gray-600 mt-1">Debit/Credit postings for funding transfers and cash withdrawals.</p>
          </div>

          <div className="border-b border-gray-100 bg-white/80 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <select
                value={journalFilters.entryType}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, entryType: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="all">All Entry Types</option>
                <option value="transfer">Transfer</option>
                <option value="withdrawal">Withdrawal</option>
              </select>

              <select
                value={journalFilters.txMark}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, txMark: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="all">All Tx Marks</option>
                <option value="Transfer In">Transfer In</option>
                <option value="Transfer Out">Transfer Out</option>
                <option value="Cheque Deposit">Cheque Deposit</option>
                <option value="Cheque Return">Cheque Return</option>
                <option value="Pending Receipt">Pending Receipt</option>
                <option value="Withdrawal">Withdrawal</option>
                <option value="Transfer">Transfer</option>
              </select>

              <select
                value={journalFilters.accountMark}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, accountMark: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="all">All Accounts</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="Cheque">Cheque</option>
                <option value="Mixed">Mixed</option>
              </select>

              <select
                value={journalFilters.status}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, status: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="completed">Completed</option>
              </select>

              <input
                type="date"
                value={journalFilters.fromDate}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="date"
                value={journalFilters.toDate}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, toDate: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="text"
                value={journalFilters.search}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Search ref, note, account..."
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm md:col-span-5"
              />

              <button
                type="button"
                onClick={() =>
                  setJournalFilters({
                    entryType: 'all',
                    txMark: 'all',
                    accountMark: 'all',
                    status: 'all',
                    fromDate: '',
                    toDate: '',
                    search: '',
                  })
                }
                className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Reset Filters
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] divide-y divide-gray-200">
              <thead className="bg-slate-100/90">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Balance (Account)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Reference</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredJournalRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">No journal entries match current filters.</td>
                  </tr>
                ) : (
                  paginatedJournalEntries.map((entry, idx) => (
                    <tr key={entry.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'} transition hover:bg-amber-50/35`}>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatJournalDateTime(entry.posted_at, entry.date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="capitalize">{entry.entry_type || 'transfer'}</span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              entry.txMark === 'Transfer In'
                                ? 'bg-emerald-100 text-emerald-700'
                                : entry.txMark === 'Transfer Out'
                                  ? 'bg-rose-100 text-rose-700'
                                  : entry.txMark === 'Cheque Deposit'
                                    ? 'bg-cyan-100 text-cyan-700'
                                    : entry.txMark === 'Cheque Return'
                                      ? 'bg-orange-100 text-orange-700'
                                      : entry.txMark === 'Pending Receipt'
                                        ? 'bg-amber-100 text-amber-700'
                                        : entry.txMark === 'Withdrawal'
                                          ? 'bg-orange-100 text-orange-700'
                                          : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {entry.txMark}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              entry.accountMark === 'Cash'
                                ? 'bg-emerald-100 text-emerald-700'
                                : entry.accountMark === 'Bank'
                                  ? 'bg-sky-100 text-sky-700'
                                  : entry.accountMark === 'Cheque'
                                    ? 'bg-violet-100 text-violet-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {entry.accountMark}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{entry.company_name}</td>
                      <td className="px-4 py-3 text-sm text-emerald-700">{entry.displayDebitAccount}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-700">
                        {money(Number(entry.displayDebitAmount || 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-rose-700">{entry.displayCreditAccount}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-rose-700">
                        {money(Number(entry.displayCreditAmount || 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-cyan-700">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-600">{entry.balanceLabel}</span>
                          <span>{money(entry.runningBalance)}</span>
                        </div>
                      </td>
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
                          {entry.status || 'completed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{entry.reference || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 bg-white/80 px-5 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {journalRangeStart}-{journalRangeEnd} of {filteredJournalRows.length} entries
              {filteredJournalRows.length !== journalRows.length ? ` (filtered from ${journalRows.length})` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setJournalPage((prev) => Math.max(1, prev - 1))}
                disabled={currentJournalPage === 1 || filteredJournalRows.length === 0}
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
                disabled={currentJournalPage === totalJournalPages || filteredJournalRows.length === 0}
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
