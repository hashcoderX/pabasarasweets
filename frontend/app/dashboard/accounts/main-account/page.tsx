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
  email?: string;
  address?: string;
  phone?: string;
  website?: string;
  country?: string;
  currency?: string;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
  bank_accounts?: CompanyAccountEntry[];
  cheque_accounts?: CompanyAccountEntry[];
};

type OutletProfile = {
  id: number;
  name: string;
  code?: string;
  status?: 'active' | 'inactive';
};

type LedgerEntry = {
  id: string;
  date: string;
  type: 'in' | 'out';
  amount: number;
  note: string;
  reference: string;
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
  target_outlet_id?: number;
  target_outlet_account?: 'cash' | 'bank' | 'cheque';
  debit_account: string;
  credit_account: string;
  amount: number;
  debit_amount?: number;
  credit_amount?: number;
  balance?: number;
  reference: string;
  note: string;
};

type PendingMainFundRequest = {
  id: string;
  date: string;
  status: 'pending';
  outlet_id: number;
  outlet_name: string;
  company_id: number;
  company_name: string;
  target_account: 'cash' | 'bank' | 'cheque';
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

type NoticeModalState = {
  open: boolean;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'error';
};

type ConfirmModalState = {
  open: boolean;
  title: string;
  message: string;
};

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const JOURNAL_PAGE_SIZE = 10;

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

export default function MainAccountPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CompanyProfile[]>([]);
  const [outlets, setOutlets] = useState<OutletProfile[]>([]);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');
  const [addCashSaving, setAddCashSaving] = useState(false);
  const [addCashError, setAddCashError] = useState('');
  const [addCashSuccess, setAddCashSuccess] = useState('');
  const [withdrawSaving, setWithdrawSaving] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');
  const [depositSaving, setDepositSaving] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showBankHistoryModal, setShowBankHistoryModal] = useState(false);
  const [selectedBankHistoryCompanyId, setSelectedBankHistoryCompanyId] = useState('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [pendingMainFundRequests, setPendingMainFundRequests] = useState<PendingMainFundRequest[]>([]);
  const [acceptingRequestId, setAcceptingRequestId] = useState('');
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
  const [noticeModal, setNoticeModal] = useState<NoticeModalState>({
    open: false,
    title: '',
    message: '',
    tone: 'info',
  });
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    open: false,
    title: '',
    message: '',
  });
  const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);
  const [transferForm, setTransferForm] = useState({
    companyId: '',
    sourceType: 'cash' as 'cash' | 'bank',
    sourceBankAccountId: '',
    targetLedger: 'petty' as 'petty' | 'delivery' | 'outlet',
    targetOutletId: '',
    targetOutletAccount: 'cash' as 'cash' | 'bank' | 'cheque',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
  });
  const [withdrawForm, setWithdrawForm] = useState({
    companyId: '',
    sourceType: 'cash' as 'cash' | 'bank',
    sourceBankAccountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
    debitAccount: 'Cash Withdrawal Expense',
  });
  const [addCashForm, setAddCashForm] = useState({
    companyId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
    creditAccount: 'Capital Injection',
  });
  const [depositForm, setDepositForm] = useState({
    companyId: '',
    sourceType: 'cash' as 'cash' | 'cheque',
    bankAccountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
  });

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);

  const showNoticeModal = (title: string, message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    setNoticeModal({ open: true, title, message, tone });
  };

  const openConfirmModal = (title: string, message: string, action: () => void) => {
    setConfirmAction(() => action);
    setConfirmModal({ open: true, title, message });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ open: false, title: '', message: '' });
    setConfirmAction(null);
  };

  const runConfirmAction = () => {
    const action = confirmAction;
    closeConfirmModal();
    if (action) action();
  };

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

  const mapTransactionToJournal = (row: MainCashTransactionRow): JournalEntry => {
    const entryType = detectEntryType(row.reference, row.note) || (row.type === 'out' ? 'withdrawal' : 'transfer');

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
      balance: undefined,
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

  const mapToUiJournalRow = (entry: MainJournalRow, currentRunningBalance: number): JournalUiRow => {
    const amount = Number(entry.amount || 0);
    const txMark = getTxMark(entry);

    // User-facing rule for transfer rows: main account shown on debit side, receiving account on credit side.
    const shouldFlipTransferSides = txMark === 'Transfer Out';

    const defaultDebitAccount = String(entry.debit_account || '-');
    const defaultCreditAccount = String(entry.credit_account || '-');
    const defaultDebitAmount = Number(entry.debit_amount ?? amount);
    const defaultCreditAmount = Number(entry.credit_amount ?? amount);

    const displayDebitAccount = shouldFlipTransferSides ? defaultCreditAccount : defaultDebitAccount;
    const displayCreditAccount = shouldFlipTransferSides ? defaultDebitAccount : defaultCreditAccount;
    const displayDebitAmount = shouldFlipTransferSides ? defaultCreditAmount : defaultDebitAmount;
    const displayCreditAmount = shouldFlipTransferSides ? defaultDebitAmount : defaultCreditAmount;

    return {
      ...entry,
      txMark,
      accountMark: getAccountMark(entry),
      // This value is set by the journal mapper using current main cash as anchor.
      runningBalance: currentRunningBalance,
      balanceLabel: 'Main Cash',
      displayDebitAccount,
      displayCreditAccount,
      displayDebitAmount,
      displayCreditAmount,
    };
  };

  const refreshJournalFromBackend = async () => {
    try {
      const journalRes = await api.get('/main-cash-transactions', { params: { per_page: 500 } });
      const payload = journalRes.data;
      const rows = Array.isArray(payload)
        ? payload
        : (payload?.data?.data || payload?.data || []);

      const mapped = (Array.isArray(rows) ? rows : [])
        .map((row) => mapTransactionToJournal(row as MainCashTransactionRow));

      setJournalEntries(mapped);
    } catch (error) {
      console.error('Failed to load journal from backend main-cash-transactions:', error);
      setJournalEntries([]);
    }
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
        const [companiesResult, outletsResult] = await Promise.allSettled([
          api.get('/companies'),
          api.get('/outlets', { params: { per_page: 200 } }),
        ]);

        if (companiesResult.status === 'fulfilled') {
          const companiesData = Array.isArray(companiesResult.value.data)
            ? companiesResult.value.data
            : (companiesResult.value.data?.data || []);
          setRows(Array.isArray(companiesData) ? companiesData : []);
        } else {
          throw companiesResult.reason;
        }

        if (outletsResult.status === 'fulfilled') {
          const outletPayload = outletsResult.value.data;
          const outletData = outletPayload?.success
            ? (outletPayload?.data?.data || outletPayload?.data || [])
            : (Array.isArray(outletPayload) ? outletPayload : []);
          setOutlets(Array.isArray(outletData) ? outletData : []);
        } else {
          setOutlets([]);
        }
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }
        console.error('Error loading company main account data:', error);
        setRows([]);
        setOutlets([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, api, router]);

  useEffect(() => {
    if (!token) return;
    refreshJournalFromBackend();
  }, [token]);

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

  useEffect(() => {
    if (!rows.length) return;

    setTransferForm((prev) => {
      if (prev.companyId) return prev;
      return {
        ...prev,
        companyId: String(rows[0].id),
      };
    });

    setWithdrawForm((prev) => {
      if (prev.companyId) return prev;
      return {
        ...prev,
        companyId: String(rows[0].id),
      };
    });

    setAddCashForm((prev) => {
      if (prev.companyId) return prev;
      return {
        ...prev,
        companyId: String(rows[0].id),
      };
    });
  }, [rows]);

  useEffect(() => {
    if (!addCashError) return;
    showNoticeModal('Add Cash Failed', addCashError, 'error');
    setAddCashError('');
  }, [addCashError]);

  useEffect(() => {
    if (!addCashSuccess) return;
    showNoticeModal('Add Cash', addCashSuccess, 'success');
    setAddCashSuccess('');
  }, [addCashSuccess]);

  useEffect(() => {
    if (!transferError) return;
    showNoticeModal('Transfer Failed', transferError, 'error');
    setTransferError('');
  }, [transferError]);

  useEffect(() => {
    if (!transferSuccess) return;
    showNoticeModal('Transfer', transferSuccess, 'success');
    setTransferSuccess('');
  }, [transferSuccess]);

  useEffect(() => {
    if (!withdrawError) return;
    showNoticeModal('Withdrawal Failed', withdrawError, 'error');
    setWithdrawError('');
  }, [withdrawError]);

  useEffect(() => {
    if (!withdrawSuccess) return;
    showNoticeModal('Withdrawal', withdrawSuccess, 'success');
    setWithdrawSuccess('');
  }, [withdrawSuccess]);

  const normalizeAccountNo = (value?: string) =>
    String(value || '')
      .replace(/\s+/g, '')
      .toLowerCase();

  const resolveCompanyOverlapInfo = (company: CompanyProfile) => {
    const bankByAccount = new Map<string, number>();
    const chequeByAccount = new Map<string, number>();

    (company.bank_accounts || []).forEach((account) => {
      const key = normalizeAccountNo(account.account_no);
      if (!key) return;
      bankByAccount.set(key, Number(account.current_balance || 0));
    });

    (company.cheque_accounts || []).forEach((account) => {
      const key = normalizeAccountNo(account.account_no);
      if (!key) return;
      chequeByAccount.set(key, Number(account.current_balance || 0));
    });

    let overlappedChequeAmount = 0;
    let overlappedBankAmount = 0;
    let nonOverlappedChequeAmount = 0;
    const overlappedAccounts: string[] = [];

    chequeByAccount.forEach((chequeBalance, accountNo) => {
      if (bankByAccount.has(accountNo)) {
        overlappedChequeAmount += Number(chequeBalance || 0);
        overlappedBankAmount += Number(bankByAccount.get(accountNo) || 0);
        overlappedAccounts.push(accountNo);
      } else {
        nonOverlappedChequeAmount += Number(chequeBalance || 0);
      }
    });

    // For shared account numbers, mirror cheque display to linked bank balance.
    const displayChequeBalance = nonOverlappedChequeAmount + overlappedBankAmount;

    return {
      overlappedChequeAmount,
      overlappedBankAmount,
      nonOverlappedChequeAmount,
      displayChequeBalance,
      overlappedAccounts,
      hasOverlap: overlappedAccounts.length > 0,
    };
  };

  const getCompanyDisplayTotal = (company: CompanyProfile) => {
    const cash = Number(company.current_cash_balance || 0);
    const bank = Number(company.current_bank_balance || 0);
    const overlapInfo = resolveCompanyOverlapInfo(company);
    // Shared cheque/bank account numbers represent the same funds; add only non-overlapped cheque.
    return cash + bank + Number(overlapInfo.nonOverlappedChequeAmount || 0);
  };

  const getCompanyAdjustedChequeBalance = (company: CompanyProfile) => {
    return Number(resolveCompanyOverlapInfo(company).displayChequeBalance || 0);
  };

  const summary = useMemo(() => {
    const totalCash = rows.reduce((sum, company) => sum + Number(company.current_cash_balance || 0), 0);
    const totalBank = rows.reduce((sum, company) => sum + Number(company.current_bank_balance || 0), 0);
    const totalChequeRaw = rows.reduce((sum, company) => sum + Number(company.current_cheque_balance || 0), 0);
    const totalChequeDisplay = rows.reduce(
      (sum, company) => sum + Number(resolveCompanyOverlapInfo(company).displayChequeBalance || 0),
      0
    );
    const overlappedCheque = rows.reduce(
      (sum, company) => sum + resolveCompanyOverlapInfo(company).overlappedChequeAmount,
      0
    );
    const overlappedBankMirror = rows.reduce(
      (sum, company) => sum + Number(resolveCompanyOverlapInfo(company).overlappedBankAmount || 0),
      0
    );
    const totalChequeNetForGrand = rows.reduce(
      (sum, company) => sum + Number(resolveCompanyOverlapInfo(company).nonOverlappedChequeAmount || 0),
      0
    );

    return {
      totalCash,
      totalBank,
      totalCheque: totalChequeDisplay,
      totalChequeRaw,
      overlappedCheque,
      overlappedBankMirror,
      totalChequeNetForGrand,
      grandTotal: totalCash + totalBank + totalChequeNetForGrand,
    };
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

  const selectedCompany = useMemo(
    () => rows.find((company) => String(company.id) === transferForm.companyId) || null,
    [rows, transferForm.companyId]
  );

  const availableBankAccounts = useMemo(() => selectedCompany?.bank_accounts || [], [selectedCompany]);

  const selectedTransferOutlet = useMemo(
    () => outlets.find((outlet) => String(outlet.id) === transferForm.targetOutletId) || null,
    [outlets, transferForm.targetOutletId]
  );

  const selectedWithdrawCompany = useMemo(
    () => rows.find((company) => String(company.id) === withdrawForm.companyId) || null,
    [rows, withdrawForm.companyId]
  );

  const selectedDepositCompany = useMemo(
    () => rows.find((company) => String(company.id) === depositForm.companyId) || null,
    [rows, depositForm.companyId]
  );

  const availableDepositBankAccounts = useMemo(
    () => selectedDepositCompany?.bank_accounts || [],
    [selectedDepositCompany]
  );

  const selectedBankHistoryCompany = useMemo(
    () => rows.find((company) => String(company.id) === selectedBankHistoryCompanyId) || null,
    [rows, selectedBankHistoryCompanyId]
  );

  const selectedAddCashCompany = useMemo(
    () => rows.find((company) => String(company.id) === addCashForm.companyId) || null,
    [rows, addCashForm.companyId]
  );

  const availableWithdrawBankAccounts = useMemo(
    () => selectedWithdrawCompany?.bank_accounts || [],
    [selectedWithdrawCompany]
  );

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
      balance: undefined,
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

    // Latest-first table: anchor at current balances, then roll backward per affected account.
    let currentBalance = Number(summary.totalCash || 0);
    const bankBalances = { ...currentBankBalancesByLabel };

    return combined.map((entry) => {
      const mapped = mapToUiJournalRow(entry, currentBalance);
      const bankLabel = extractBankLabel(entry);

      if (bankLabel) {
        mapped.balanceLabel = bankLabel;
        mapped.runningBalance = Number(bankBalances[bankLabel] || 0);
      } else {
        mapped.balanceLabel = 'Main Cash';
        mapped.runningBalance = currentBalance;
      }

      if (entry.status !== 'pending' && affectsMainCash(entry)) {
        const amount = Number(entry.amount || 0);

        if (mapped.txMark === 'Transfer In' || mapped.txMark === 'Cheque Deposit') {
          // Reverse of increase when walking backward in time.
          currentBalance -= amount;
        } else if (mapped.txMark === 'Transfer Out' || mapped.txMark === 'Withdrawal' || mapped.txMark === 'Cheque Return') {
          // Reverse of decrease when walking backward in time.
          currentBalance += amount;
        }
      }

      if (entry.status !== 'pending' && bankLabel) {
        const amount = Number(entry.amount || 0);

        if (mapped.txMark === 'Transfer In' || mapped.txMark === 'Cheque Deposit') {
          bankBalances[bankLabel] = Number(bankBalances[bankLabel] || 0) - amount;
        } else if (mapped.txMark === 'Transfer Out' || mapped.txMark === 'Withdrawal' || mapped.txMark === 'Cheque Return') {
          bankBalances[bankLabel] = Number(bankBalances[bankLabel] || 0) + amount;
        }
      }

      return mapped;
    });
  }, [pendingMainFundRequests, journalEntries, summary.totalCash, currentBankBalancesByLabel]);

  const bankHistoryRows = useMemo(() => {
    if (!selectedBankHistoryCompany) return [];

    const bankNameTokens = (selectedBankHistoryCompany.bank_accounts || [])
      .map((bank) => String(bank.bank_name || '').trim().toLowerCase())
      .filter((name) => name.length > 0);

    const bankAccountTokens = (selectedBankHistoryCompany.bank_accounts || [])
      .map((bank) => normalizeAccountNo(bank.account_no))
      .filter((no) => no.length > 0);

    const matching = journalRows.filter((entry) => {
      const text = [
        entry.source_account,
        entry.target_account,
        entry.debit_account,
        entry.credit_account,
        entry.balanceLabel,
        entry.note,
        entry.reference,
      ]
        .join(' ')
        .toLowerCase();

      const isBankRelated = entry.accountMark === 'Bank' || text.includes('bank');
      if (!isBankRelated) return false;

      if (bankNameTokens.length === 0 && bankAccountTokens.length === 0) {
        return true;
      }

      const hasNameMatch = bankNameTokens.some((token) => text.includes(token));
      const normalizedText = text.replace(/\s+/g, '');
      const hasAccountNoMatch = bankAccountTokens.some((token) => normalizedText.includes(token));

      return hasNameMatch || hasAccountNoMatch;
    });

    return matching;
  }, [selectedBankHistoryCompany, journalRows]);

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

      if (journalFilters.entryType !== 'all' && entryType !== journalFilters.entryType) {
        return false;
      }

      if (journalFilters.txMark !== 'all' && entry.txMark !== journalFilters.txMark) {
        return false;
      }

      if (journalFilters.accountMark !== 'all') {
        if (journalFilters.accountMark === 'Bank' && !accountText.includes('bank')) {
          return false;
        }

        if (journalFilters.accountMark === 'Cash' && !accountText.includes('cash')) {
          return false;
        }

        if (
          journalFilters.accountMark === 'Cheque' &&
          !(accountText.includes('cheque') || accountText.includes('check'))
        ) {
          return false;
        }

        if (journalFilters.accountMark === 'Mixed' && entry.accountMark !== 'Mixed') {
          return false;
        }
      }

      if (journalFilters.status !== 'all' && entryStatus !== journalFilters.status) {
        return false;
      }

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

        if (!haystack.includes(searchText)) {
          return false;
        }
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

  const readLedger = (key: string): LedgerEntry[] => {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeLedger = (key: string, data: LedgerEntry[]) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const persistLedgerEntry = async (storageKey: string, apiEndpoint: string, entry: LedgerEntry) => {
    try {
      await api.post(apiEndpoint, {
        date: entry.date,
        type: entry.type,
        amount: entry.amount,
        reference: entry.reference || null,
        note: entry.note || null,
      });
    } catch (error) {
      console.error(`Failed to persist ${apiEndpoint}, using local fallback:`, error);
      writeLedger(storageKey, [entry, ...readLedger(storageKey)]);
    }
  };

  const handleAcceptMainFundRequest = async (requestId: string) => {
    const request = pendingMainFundRequests.find((entry) => entry.id === requestId);
    if (!request) {
      setTransferError('Pending request not found.');
      return;
    }

    const targetCompany = rows.find((company) => company.id === request.company_id);
    if (!targetCompany) {
      setTransferError('Target company not found for this pending request.');
      return;
    }

    const amount = Number(request.amount || 0);
    if (amount <= 0) {
      setTransferError('Invalid pending request amount.');
      return;
    }

    const nextCash = Number(targetCompany.current_cash_balance || 0) + (request.target_account === 'cash' ? amount : 0);
    const nextBank = Number(targetCompany.current_bank_balance || 0) + (request.target_account === 'bank' ? amount : 0);
    const nextCheque = Number(targetCompany.current_cheque_balance || 0) + (request.target_account === 'cheque' ? amount : 0);

    const payload = {
      name: targetCompany.name,
      email: targetCompany.email || '',
      address: targetCompany.address || null,
      phone: targetCompany.phone || null,
      website: targetCompany.website || null,
      country: targetCompany.country || null,
      currency: targetCompany.currency || null,
      current_cash_balance: nextCash,
      current_bank_balance: nextBank,
      current_cheque_balance: nextCheque,
      bank_accounts: targetCompany.bank_accounts || [],
      cheque_accounts: targetCompany.cheque_accounts || [],
    };

    try {
      setAcceptingRequestId(requestId);
      const res = await api.put(`/companies/${targetCompany.id}`, payload);
      const updatedCompany = res.data;

      setRows((prev) =>
        prev.map((company) => (company.id === targetCompany.id ? { ...company, ...updatedCompany } : company))
      );

      await api.post('/main-cash-transactions', {
        date: request.date,
        type: 'in',
        amount,
        reference: request.reference || null,
        note:
          request.note ||
          `Fund transfer received. Dr ${request.target_account_label}, Cr Outlet - ${request.outlet_name}.`,
      });

      await refreshJournalFromBackend();

      setPendingMainFundRequests((prev) => {
        const nextPending = prev.filter((entry) => entry.id !== requestId);
        localStorage.setItem('main_account_pending_fund_requests', JSON.stringify(nextPending));
        return nextPending;
      });

      setJournalPage(1);
      setTransferSuccess('Pending outlet transfer accepted and posted to main account.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to accept pending transfer.';
      setTransferError(apiMessage);
    } finally {
      setAcceptingRequestId('');
    }
  };

  const handleTransfer = async () => {
    setTransferError('');
    setTransferSuccess('');

    if (!selectedCompany) {
      setTransferError('Please select a company.');
      return;
    }

    const amount = Number(transferForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      setTransferError('Transfer amount must be greater than zero.');
      return;
    }

    const sourceType = transferForm.sourceType;
    const targetLedger = transferForm.targetLedger;
    const targetOutletAccount = transferForm.targetOutletAccount;

    if (targetLedger === 'outlet' && !selectedTransferOutlet) {
      setTransferError('Please select the target outlet.');
      return;
    }

    let sourceAccountLabel = 'Cash Account';
    let targetAccountLabel = '';
    let nextCashBalance = Number(selectedCompany.current_cash_balance || 0);
    const nextBankAccounts = [...(selectedCompany.bank_accounts || [])];

    if (sourceType === 'cash') {
      if (nextCashBalance < amount) {
        setTransferError('Insufficient cash balance for this transfer.');
        return;
      }
      nextCashBalance -= amount;
    } else {
      const bankIndex = nextBankAccounts.findIndex(
        (account) => String(account.id) === transferForm.sourceBankAccountId
      );

      if (bankIndex < 0) {
        setTransferError('Please select the source bank account.');
        return;
      }

      const bankBalance = Number(nextBankAccounts[bankIndex].current_balance || 0);
      if (bankBalance < amount) {
        setTransferError('Insufficient selected bank balance for this transfer.');
        return;
      }

      nextBankAccounts[bankIndex] = {
        ...nextBankAccounts[bankIndex],
        current_balance: bankBalance - amount,
      };

      sourceAccountLabel = `Bank - ${nextBankAccounts[bankIndex].bank_name || 'Account'}`;
    }

    const payload = {
      name: selectedCompany.name,
      email: selectedCompany.email || '',
      address: selectedCompany.address || null,
      phone: selectedCompany.phone || null,
      website: selectedCompany.website || null,
      country: selectedCompany.country || null,
      currency: selectedCompany.currency || null,
      current_cash_balance: nextCashBalance,
      current_cheque_balance: Number(selectedCompany.current_cheque_balance || 0),
      bank_accounts: nextBankAccounts,
      cheque_accounts: selectedCompany.cheque_accounts || [],
    };

    try {
      setTransferSaving(true);
      const res = await api.put(`/companies/${selectedCompany.id}`, payload);
      const updatedCompany = res.data;

      const nextRows = rows.map((company) =>
        company.id === selectedCompany.id ? { ...company, ...updatedCompany } : company
      );
      setRows(nextRows);

      const transferRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const reference = transferForm.reference.trim() || `TRF-${Date.now()}`;
      const note = transferForm.note.trim();
      const date = transferForm.date;

      if (targetLedger === 'petty' || targetLedger === 'delivery') {
        const targetLedgerKey = targetLedger === 'petty' ? 'accounts_petty_cash_ledger' : 'accounts_delivery_cash_ledger';
        const targetApiEndpoint = targetLedger === 'petty' ? '/petty-cash-transactions' : '/delivery-cash-transactions';
        targetAccountLabel = targetLedger === 'petty' ? 'Petty Cash Account' : 'Delivery Cash Account';

        const transferInEntry: LedgerEntry = {
          id: transferRequestId,
          date,
          type: 'in',
          amount,
          reference,
          note:
            note ||
            `Fund transfer received. Dr ${targetAccountLabel}, Cr ${sourceAccountLabel}.`,
        };

        await persistLedgerEntry(targetLedgerKey, targetApiEndpoint, transferInEntry);
      } else {
        if (!selectedTransferOutlet) {
          setTransferError('Please select the target outlet.');
          return;
        }

        const outletPendingKey = `outlet_account_pending_funds_${selectedTransferOutlet.id}`;

        const outletAccountLabel =
          targetOutletAccount === 'cash'
            ? 'Outlet Cash'
            : targetOutletAccount === 'bank'
              ? 'Outlet Bank'
              : 'Outlet Cheque';

        targetAccountLabel = `${selectedTransferOutlet.name} - ${outletAccountLabel}`;

        const existingPendingRequests = (() => {
          try {
            const raw = localStorage.getItem(outletPendingKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })();

        const pendingRequest = {
          id: transferRequestId,
          date,
          status: 'pending',
          account: targetOutletAccount,
          account_label: outletAccountLabel,
          source_company_name: selectedCompany.name,
          outlet_name: selectedTransferOutlet.name,
          source_account: sourceAccountLabel,
          credit_account: sourceAccountLabel,
          debit_account: outletAccountLabel,
          amount,
          debit_amount: amount,
          credit_amount: amount,
          reference,
          note:
            note ||
            `Pending transfer from ${selectedCompany.name}. Awaiting outlet acceptance.`,
        };

        localStorage.setItem(outletPendingKey, JSON.stringify([pendingRequest, ...existingPendingRequests]));
      }

      if (sourceType === 'cash') {
        const cashBookOut: LedgerEntry = {
          id: transferRequestId,
          date,
          type: 'out',
          amount,
          reference,
          note:
            note ||
            `Fund transfer issued. Dr ${targetAccountLabel}, Cr Cash Account.`,
        };
        await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', cashBookOut);
      } else {
        await api.post('/main-cash-transactions', {
          date,
          type: 'out',
          amount,
          reference: reference || null,
          note:
            note ||
            `Fund transfer issued. Dr ${targetAccountLabel}, Cr ${sourceAccountLabel}.`,
        });
      }

      await refreshJournalFromBackend();

      setTransferForm((prev) => ({
        ...prev,
        amount: '',
        reference: '',
        note: '',
      }));
      setJournalPage(1);
      setTransferSuccess(
        targetLedger === 'outlet'
          ? 'Transfer sent to outlet as pending. Outlet user must accept to update outlet account.'
          : 'Transfer posted successfully using debit/credit journal treatment.'
      );
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to post transfer entry.';

      setTransferError(apiMessage);
    } finally {
      setTransferSaving(false);
    }
  };

  const handleAddCash = async () => {
    setAddCashError('');
    setAddCashSuccess('');

    if (!selectedAddCashCompany) {
      setAddCashError('Please select a company.');
      return;
    }

    const amount = Number(addCashForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      setAddCashError('Add cash amount must be greater than zero.');
      return;
    }

    const nextCashBalance = Number(selectedAddCashCompany.current_cash_balance || 0) + amount;

    const payload = {
      name: selectedAddCashCompany.name,
      email: selectedAddCashCompany.email || '',
      address: selectedAddCashCompany.address || null,
      phone: selectedAddCashCompany.phone || null,
      website: selectedAddCashCompany.website || null,
      country: selectedAddCashCompany.country || null,
      currency: selectedAddCashCompany.currency || null,
      current_cash_balance: nextCashBalance,
      current_bank_balance: Number(selectedAddCashCompany.current_bank_balance || 0),
      current_cheque_balance: Number(selectedAddCashCompany.current_cheque_balance || 0),
      bank_accounts: selectedAddCashCompany.bank_accounts || [],
      cheque_accounts: selectedAddCashCompany.cheque_accounts || [],
    };

    try {
      setAddCashSaving(true);
      const res = await api.put(`/companies/${selectedAddCashCompany.id}`, payload);
      const updatedCompany = res.data;

      const nextRows = rows.map((company) =>
        company.id === selectedAddCashCompany.id ? { ...company, ...updatedCompany } : company
      );
      setRows(nextRows);

      const reference = addCashForm.reference.trim() || `ADD-${Date.now()}`;
      const note = addCashForm.note.trim();
      const date = addCashForm.date;
      const creditAccount = addCashForm.creditAccount.trim() || 'Capital Injection';

      const addCashEntry: LedgerEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        type: 'in',
        amount,
        reference,
        note:
          note ||
          `Main cash added. Dr Main Cash Account, Cr ${creditAccount}.`,
      };

      await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', addCashEntry);
      await refreshJournalFromBackend();

      setAddCashForm((prev) => ({
        ...prev,
        amount: '',
        reference: '',
        note: '',
      }));
      setJournalPage(1);
      setAddCashSuccess('Cash added to main account successfully with journal entry.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to add cash to main account.';

      setAddCashError(apiMessage);
    } finally {
      setAddCashSaving(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawError('');
    setWithdrawSuccess('');

    if (!selectedWithdrawCompany) {
      setWithdrawError('Please select a company.');
      return;
    }

    const amount = Number(withdrawForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      setWithdrawError('Withdrawal amount must be greater than zero.');
      return;
    }

    const sourceType = withdrawForm.sourceType;
    let sourceAccountLabel = 'Cash Account';
    let nextCashBalance = Number(selectedWithdrawCompany.current_cash_balance || 0);
    const nextBankAccounts = [...(selectedWithdrawCompany.bank_accounts || [])];

    if (sourceType === 'cash') {
      if (nextCashBalance < amount) {
        setWithdrawError('Insufficient cash balance for this withdrawal.');
        return;
      }
      nextCashBalance -= amount;
    } else {
      const bankIndex = nextBankAccounts.findIndex(
        (account) => String(account.id) === withdrawForm.sourceBankAccountId
      );

      if (bankIndex < 0) {
        setWithdrawError('Please select the source bank account.');
        return;
      }

      const bankBalance = Number(nextBankAccounts[bankIndex].current_balance || 0);
      if (bankBalance < amount) {
        setWithdrawError('Insufficient selected bank balance for this withdrawal.');
        return;
      }

      nextBankAccounts[bankIndex] = {
        ...nextBankAccounts[bankIndex],
        current_balance: bankBalance - amount,
      };

      sourceAccountLabel = `Bank - ${nextBankAccounts[bankIndex].bank_name || 'Account'}`;
    }

    const payload = {
      name: selectedWithdrawCompany.name,
      email: selectedWithdrawCompany.email || '',
      address: selectedWithdrawCompany.address || null,
      phone: selectedWithdrawCompany.phone || null,
      website: selectedWithdrawCompany.website || null,
      country: selectedWithdrawCompany.country || null,
      currency: selectedWithdrawCompany.currency || null,
      current_cash_balance: nextCashBalance,
      current_cheque_balance: Number(selectedWithdrawCompany.current_cheque_balance || 0),
      bank_accounts: nextBankAccounts,
      cheque_accounts: selectedWithdrawCompany.cheque_accounts || [],
    };

    try {
      setWithdrawSaving(true);
      const res = await api.put(`/companies/${selectedWithdrawCompany.id}`, payload);
      const updatedCompany = res.data;

      const nextRows = rows.map((company) =>
        company.id === selectedWithdrawCompany.id ? { ...company, ...updatedCompany } : company
      );
      setRows(nextRows);

      const reference = withdrawForm.reference.trim() || `WDR-${Date.now()}`;
      const note = withdrawForm.note.trim();
      const date = withdrawForm.date;
      const debitAccount = withdrawForm.debitAccount.trim() || 'Cash Withdrawal Expense';

      const withdrawalEntry: LedgerEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        type: 'out',
        amount,
        reference,
        note:
          note ||
          `Cash withdrawal posted. Dr ${debitAccount}, Cr ${sourceAccountLabel}.`,
      };

      await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', withdrawalEntry);

      await refreshJournalFromBackend();

      setWithdrawForm((prev) => ({
        ...prev,
        amount: '',
        reference: '',
        note: '',
      }));
      setJournalPage(1);
      setWithdrawSuccess('Withdrawal posted successfully with debit/credit journal entry.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to post withdrawal entry.';

      setWithdrawError(apiMessage);
    } finally {
      setWithdrawSaving(false);
    }
  };

  const openDepositModal = (company: CompanyProfile) => {
    const firstBankId = company.bank_accounts?.[0]?.id ? String(company.bank_accounts[0].id) : '';
    setDepositForm({
      companyId: String(company.id),
      sourceType: 'cash',
      bankAccountId: firstBankId,
      amount: '',
      date: new Date().toISOString().split('T')[0],
      reference: '',
      note: '',
    });
    setShowDepositModal(true);
  };

  const openBankHistoryModal = (company: CompanyProfile) => {
    setSelectedBankHistoryCompanyId(String(company.id));
    setShowBankHistoryModal(true);
  };

  const closeBankHistoryModal = () => {
    setShowBankHistoryModal(false);
    setSelectedBankHistoryCompanyId('');
  };

  const closeDepositModal = () => {
    setShowDepositModal(false);
    setDepositForm((prev) => ({
      ...prev,
      amount: '',
      reference: '',
      note: '',
    }));
  };

  const handleDepositBank = async () => {
    if (!selectedDepositCompany) {
      showNoticeModal('Deposit Failed', 'Please select a company for this deposit.', 'error');
      return;
    }

    const amount = Number(depositForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      showNoticeModal('Deposit Failed', 'Deposit amount must be greater than zero.', 'error');
      return;
    }

    const bankIndex = (selectedDepositCompany.bank_accounts || []).findIndex(
      (account) => String(account.id) === depositForm.bankAccountId
    );

    if (bankIndex < 0) {
      showNoticeModal('Deposit Failed', 'Please select a target bank account.', 'error');
      return;
    }

    const currentCash = Number(selectedDepositCompany.current_cash_balance || 0);
    const currentCheque = Number(selectedDepositCompany.current_cheque_balance || 0);
    const currentBank = Number(selectedDepositCompany.current_bank_balance || 0);

    if (depositForm.sourceType === 'cash' && currentCash < amount) {
      showNoticeModal('Deposit Failed', 'Insufficient cash balance for this deposit.', 'error');
      return;
    }

    if (depositForm.sourceType === 'cheque' && currentCheque < amount) {
      showNoticeModal('Deposit Failed', 'Insufficient cheque balance for this deposit.', 'error');
      return;
    }

    const nextBankAccounts = [...(selectedDepositCompany.bank_accounts || [])];
    const selectedBank = nextBankAccounts[bankIndex];
    const selectedBankName = selectedBank.bank_name || 'Bank Account';

    nextBankAccounts[bankIndex] = {
      ...selectedBank,
      current_balance: Number(selectedBank.current_balance || 0) + amount,
    };

    const payload = {
      name: selectedDepositCompany.name,
      email: selectedDepositCompany.email || '',
      address: selectedDepositCompany.address || null,
      phone: selectedDepositCompany.phone || null,
      website: selectedDepositCompany.website || null,
      country: selectedDepositCompany.country || null,
      currency: selectedDepositCompany.currency || null,
      current_cash_balance: depositForm.sourceType === 'cash' ? currentCash - amount : currentCash,
      current_bank_balance: currentBank + amount,
      current_cheque_balance: depositForm.sourceType === 'cheque' ? currentCheque - amount : currentCheque,
      bank_accounts: nextBankAccounts,
      cheque_accounts: selectedDepositCompany.cheque_accounts || [],
    };

    try {
      setDepositSaving(true);
      const res = await api.put(`/companies/${selectedDepositCompany.id}`, payload);
      const updatedCompany = res.data;

      setRows((prev) =>
        prev.map((company) => (company.id === selectedDepositCompany.id ? { ...company, ...updatedCompany } : company))
      );

      const reference = depositForm.reference.trim() || `DEP-${Date.now()}`;
      const date = depositForm.date;
      const note = depositForm.note.trim();

      if (depositForm.sourceType === 'cash') {
        const depositEntry: LedgerEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          date,
          type: 'out',
          amount,
          reference,
          note: note || `Bank deposit posted. Dr Bank - ${selectedBankName}, Cr Cash Account.`,
        };

        await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', depositEntry);
        await refreshJournalFromBackend();
      }

      setJournalPage(1);
      closeDepositModal();
      showNoticeModal('Deposit Posted', 'Bank deposit posted successfully.', 'success');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to post bank deposit.';

      showNoticeModal('Deposit Failed', apiMessage, 'error');
    } finally {
      setDepositSaving(false);
    }
  };

  const renderAccountBalances = (
    accounts: CompanyAccountEntry[] | undefined,
    tone: 'bank' | 'cheque',
    company?: CompanyProfile
  ) => {
    if (!accounts || accounts.length === 0) {
      return <span className="text-xs text-gray-400">No accounts</span>;
    }

    const bankBalancesByAccountNo = new Map<string, number>();
    if (tone === 'cheque' && company) {
      (company.bank_accounts || []).forEach((bankAccount) => {
        const key = normalizeAccountNo(bankAccount.account_no);
        if (!key) return;
        bankBalancesByAccountNo.set(key, Number(bankAccount.current_balance || 0));
      });
    }

    return (
      <div className="space-y-2">
        {accounts.map((account) => {
          const accountNoKey = normalizeAccountNo(account.account_no);
          const linkedBankBalance = accountNoKey ? bankBalancesByAccountNo.get(accountNoKey) : undefined;
          const hasLinkedBankBalance = tone === 'cheque' && typeof linkedBankBalance === 'number';
          const displayBalance = hasLinkedBankBalance
            ? Number(linkedBankBalance || 0)
            : Number(account.current_balance || 0);

          return (
            <div key={account.id} className="rounded-lg border border-gray-100 bg-gray-50/70 px-2 py-1.5">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {account.bank_name || (tone === 'bank' ? 'Bank Account' : 'Cheque Account')}
              </p>
              <p className="text-[11px] text-gray-500 truncate">A/C: {account.account_no || '-'}</p>
              <p className={`text-xs font-bold ${tone === 'bank' ? 'text-sky-700' : 'text-violet-700'}`}>
                {money(displayBalance)}
              </p>
            </div>
          );
        })}
      </div>
    );
  };

  if (!token || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.2),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.16),_transparent_28%),linear-gradient(180deg,_#f0fdf9_0%,_#ecfeff_45%,_#f0fdfa_100%)]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_28%),linear-gradient(180deg,_#f0fdf9_0%,_#ecfeff_45%,_#f0fdfa_100%)]">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Link href="/dashboard/accounts" className="flex items-center space-x-2 text-gray-700 hover:text-teal-600">
                <span>←</span>
                <span className="font-medium text-sm sm:text-base">Back to Accounts</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 rounded-full animate-pulse bg-emerald-500"></div>
              <span>Live Company Main Account</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-[0_24px_90px_-42px_rgba(13,148,136,0.55)] backdrop-blur-xl">
          <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:px-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                Live company finance control
              </div>
              <h1 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">Company Main Account</h1>
              <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl">
                Live balance view from company cash, bank, and cheque accounting records.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-emerald-300/70 bg-gradient-to-br from-emerald-500 to-teal-500 p-5 text-white shadow-lg shadow-emerald-300/45">
                <p className="text-xs uppercase tracking-[0.2em] text-white/85">Grand Total</p>
                <p className="mt-2 text-3xl font-bold">{money(summary.grandTotal)}</p>
              </div>
              <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Total Cash</p>
                <p className="mt-2 text-lg font-bold text-emerald-800">{money(summary.totalCash)}</p>
              </div>
              <div className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-700">Total Bank</p>
                <p className="mt-2 text-lg font-bold text-sky-800">{money(summary.totalBank)}</p>
              </div>
              <div className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-violet-700">Total Cheque (Bank-Aligned)</p>
                <p className="mt-2 text-lg font-bold text-violet-800">{money(summary.totalCheque)}</p>
                {summary.overlappedCheque > 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Raw: {money(summary.totalChequeRaw)} | Mirrored to bank: {money(summary.overlappedBankMirror)}
                  </p>
                ) : null}
                {summary.totalChequeNetForGrand !== summary.totalCheque ? (
                  <p className="mt-1 text-[11px] text-slate-600">
                    Grand total counts only non-overlapped cheque: {money(summary.totalChequeNetForGrand)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add Cash to Main Account</h2>
            <p className="text-sm text-gray-600 mt-1">
              Accounting entry: main cash account is <span className="font-semibold">Debit</span>, source/funding account is <span className="font-semibold">Credit</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
            <select
              value={addCashForm.companyId}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, companyId: e.target.value }))}
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            >
              <option value="">Select Company</option>
              {rows.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={addCashForm.creditAccount}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, creditAccount: e.target.value }))}
              placeholder="Credit Account (e.g. Capital Injection)"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            />

            <input
              type="date"
              value={addCashForm.date}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={addCashForm.amount}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={addCashForm.reference}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={addCashForm.note}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Narration"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            />

            <button
              type="button"
              onClick={() =>
                openConfirmModal(
                  'Post Add Cash?',
                  'Confirm adding this cash amount to the selected main account.',
                  handleAddCash
                )
              }
              disabled={addCashSaving}
              className="rounded-full bg-gradient-to-r from-emerald-600 to-cyan-600 text-white text-sm font-semibold px-5 py-2.5 hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {addCashSaving ? 'Posting...' : 'Post Add Cash'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Fund Transfer to Petty/Delivery/Outlet</h2>
            <p className="text-sm text-gray-600 mt-1">
              Accounting entry: target account is <span className="font-semibold">Debit</span>, source cash/bank is <span className="font-semibold">Credit</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
            <select
              value={transferForm.companyId}
              onChange={(e) =>
                setTransferForm((prev) => ({
                  ...prev,
                  companyId: e.target.value,
                  sourceBankAccountId: '',
                }))
              }
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            >
              <option value="">Select Company</option>
              {rows.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>

            <select
              value={transferForm.sourceType}
              onChange={(e) =>
                setTransferForm((prev) => ({
                  ...prev,
                  sourceType: e.target.value as 'cash' | 'bank',
                  sourceBankAccountId: '',
                }))
              }
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            >
              <option value="cash">Source: Cash Account (Credit)</option>
              <option value="bank">Source: Bank Account (Credit)</option>
            </select>

            {transferForm.sourceType === 'bank' ? (
              <select
                value={transferForm.sourceBankAccountId}
                onChange={(e) => setTransferForm((prev) => ({ ...prev, sourceBankAccountId: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
              >
                <option value="">Select Source Bank Account</option>
                {availableBankAccounts.map((bank) => (
                  <option key={bank.id} value={String(bank.id)}>
                    {(bank.bank_name || 'Bank Account') + ` (${money(Number(bank.current_balance || 0))})`}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={transferForm.targetLedger}
                onChange={(e) =>
                  setTransferForm((prev) => ({
                    ...prev,
                    targetLedger: e.target.value as 'petty' | 'delivery' | 'outlet',
                    targetOutletId: e.target.value === 'outlet' ? prev.targetOutletId : '',
                  }))
                }
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="petty">Debit: Petty Cash Account</option>
                <option value="delivery">Debit: Delivery Cash Account</option>
                <option value="outlet">Debit: Outlet Account</option>
              </select>
            )}

            {transferForm.sourceType === 'bank' ? (
              <select
                value={transferForm.targetLedger}
                onChange={(e) =>
                  setTransferForm((prev) => ({
                    ...prev,
                    targetLedger: e.target.value as 'petty' | 'delivery' | 'outlet',
                    targetOutletId: e.target.value === 'outlet' ? prev.targetOutletId : '',
                  }))
                }
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="petty">Debit: Petty Cash Account</option>
                <option value="delivery">Debit: Delivery Cash Account</option>
                <option value="outlet">Debit: Outlet Account</option>
              </select>
            ) : null}

            {transferForm.targetLedger === 'outlet' ? (
              <select
                value={transferForm.targetOutletId}
                onChange={(e) => setTransferForm((prev) => ({ ...prev, targetOutletId: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="">Select Outlet</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={String(outlet.id)}>
                    {outlet.name + (outlet.code ? ` (${outlet.code})` : '')}
                  </option>
                ))}
              </select>
            ) : null}

            {transferForm.targetLedger === 'outlet' ? (
              <select
                value={transferForm.targetOutletAccount}
                onChange={(e) =>
                  setTransferForm((prev) => ({
                    ...prev,
                    targetOutletAccount: e.target.value as 'cash' | 'bank' | 'cheque',
                  }))
                }
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="cash">Debit Outlet Cash</option>
                <option value="bank">Debit Outlet Bank</option>
                <option value="cheque">Debit Outlet Cheque</option>
              </select>
            ) : null}

            <input
              type="date"
              value={transferForm.date}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={transferForm.amount}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={transferForm.reference}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={transferForm.note}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Narration"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            />

            <button
              type="button"
              onClick={() =>
                openConfirmModal(
                  'Post Transfer?',
                  'Confirm posting this transfer to the selected target ledger.',
                  handleTransfer
                )
              }
              disabled={transferSaving}
              className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold px-5 py-2.5 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {transferSaving ? 'Posting...' : 'Post Transfer'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cash Withdrawal (Funds Out)</h2>
            <p className="text-sm text-gray-600 mt-1">
              Accounting entry: withdrawal/expense account is <span className="font-semibold">Debit</span>, source cash/bank is <span className="font-semibold">Credit</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
            <select
              value={withdrawForm.companyId}
              onChange={(e) =>
                setWithdrawForm((prev) => ({
                  ...prev,
                  companyId: e.target.value,
                  sourceBankAccountId: '',
                }))
              }
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            >
              <option value="">Select Company</option>
              {rows.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>

            <select
              value={withdrawForm.sourceType}
              onChange={(e) =>
                setWithdrawForm((prev) => ({
                  ...prev,
                  sourceType: e.target.value as 'cash' | 'bank',
                  sourceBankAccountId: '',
                }))
              }
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            >
              <option value="cash">Source: Cash Account (Credit)</option>
              <option value="bank">Source: Bank Account (Credit)</option>
            </select>

            {withdrawForm.sourceType === 'bank' ? (
              <select
                value={withdrawForm.sourceBankAccountId}
                onChange={(e) => setWithdrawForm((prev) => ({ ...prev, sourceBankAccountId: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
              >
                <option value="">Select Source Bank Account</option>
                {availableWithdrawBankAccounts.map((bank) => (
                  <option key={bank.id} value={String(bank.id)}>
                    {(bank.bank_name || 'Bank Account') + ` (${money(Number(bank.current_balance || 0))})`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={withdrawForm.debitAccount}
                onChange={(e) => setWithdrawForm((prev) => ({ ...prev, debitAccount: e.target.value }))}
                placeholder="Debit Account (e.g. Expense)"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
              />
            )}

            {withdrawForm.sourceType === 'bank' ? (
              <input
                type="text"
                value={withdrawForm.debitAccount}
                onChange={(e) => setWithdrawForm((prev) => ({ ...prev, debitAccount: e.target.value }))}
                placeholder="Debit Account (e.g. Expense)"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />
            ) : null}

            <input
              type="date"
              value={withdrawForm.date}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={withdrawForm.amount}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={withdrawForm.reference}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={withdrawForm.note}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Narration"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            />

            <button
              type="button"
              onClick={() =>
                openConfirmModal(
                  'Post Withdrawal?',
                  'Confirm posting this withdrawal from the selected source account.',
                  handleWithdraw
                )
              }
              disabled={withdrawSaving}
              className="rounded-full bg-gradient-to-r from-rose-600 to-orange-600 text-white text-sm font-semibold px-5 py-2.5 hover:from-rose-700 hover:to-orange-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {withdrawSaving ? 'Posting...' : 'Post Withdrawal'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] overflow-hidden">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">No company balance records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] divide-y divide-gray-200">
                <thead className="bg-slate-100/90">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Company</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Cash Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Bank Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Cheque Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Bank Account Balances</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Cheque Account Balances</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {rows.map((company, idx) => {
                    const cash = Number(company.current_cash_balance || 0);
                    const bank = Number(company.current_bank_balance || 0);
                    const cheque = getCompanyAdjustedChequeBalance(company);
                    const overlapInfo = resolveCompanyOverlapInfo(company);
                    const displayTotal = getCompanyDisplayTotal(company);

                    return (
                      <tr
                        key={company.id}
                        onClick={() => openBankHistoryModal(company)}
                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'} cursor-pointer transition hover:bg-emerald-50/35`}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                          <div>{company.name}</div>
                          <div className="mt-1 text-[11px] font-medium text-sky-700">Click row to view bank transaction history</div>
                          {overlapInfo.hasOverlap ? (
                            <div className="mt-1 text-[11px] font-medium text-amber-700">
                              Shared bank/cheque account detected. Cheque is mirrored to bank balance.
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-emerald-700 font-semibold">{money(cash)}</td>
                        <td className="px-4 py-3 text-sm text-right text-sky-700 font-semibold">{money(bank)}</td>
                        <td className="px-4 py-3 text-sm text-right text-violet-700 font-semibold">{money(cheque)}</td>
                        <td className="px-4 py-3 text-sm text-right text-cyan-700 font-bold">{money(displayTotal)}</td>
                        <td className="px-4 py-3 align-top">{renderAccountBalances(company.bank_accounts, 'bank', company)}</td>
                        <td className="px-4 py-3 align-top">{renderAccountBalances(company.cheque_accounts, 'cheque', company)}</td>
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDepositModal(company);
                            }}
                            disabled={!company.bank_accounts || company.bank_accounts.length === 0}
                            className="rounded-full bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:from-sky-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Deposit Bank
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

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
                        {entry.status === 'pending' && entry.row_source === 'outlet_request' ? (
                          <button
                            type="button"
                            onClick={() =>
                              openConfirmModal(
                                'Accept Pending Transfer?',
                                'Confirm accepting this pending outlet transfer and posting it to main account.',
                                () => handleAcceptMainFundRequest(entry.id)
                              )
                            }
                            disabled={acceptingRequestId === entry.id}
                            className="ml-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {acceptingRequestId === entry.id ? 'Accepting...' : 'Accept'}
                          </button>
                        ) : null}
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

      {confirmModal.open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Confirmation</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{confirmModal.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{confirmModal.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeConfirmModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runConfirmAction}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-700 hover:to-orange-600"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDepositModal ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-sky-200 bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Bank Deposit</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Deposit to Company Bank Account</h3>
              <p className="mt-2 text-sm text-slate-600">Move funds from company cash/cheque balance into a selected bank account.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={depositForm.companyId}
                onChange={(e) => {
                  const selected = rows.find((company) => String(company.id) === e.target.value);
                  setDepositForm((prev) => ({
                    ...prev,
                    companyId: e.target.value,
                    bankAccountId: selected?.bank_accounts?.[0]?.id ? String(selected.bank_accounts[0].id) : '',
                  }));
                }}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="">Select Company</option>
                {rows.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.name}
                  </option>
                ))}
              </select>

              <select
                value={depositForm.sourceType}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, sourceType: e.target.value as 'cash' | 'cheque' }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="cash">Source: Cash Balance</option>
                <option value="cheque">Source: Cheque Balance</option>
              </select>

              <select
                value={depositForm.bankAccountId}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, bankAccountId: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm md:col-span-2"
              >
                <option value="">Select Target Bank Account</option>
                {availableDepositBankAccounts.map((bank) => (
                  <option key={bank.id} value={String(bank.id)}>
                    {(bank.bank_name || 'Bank Account') + ` (${money(Number(bank.current_balance || 0))})`}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={depositForm.date}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, date: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={depositForm.amount}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="Amount"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="text"
                value={depositForm.reference}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="Reference"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="text"
                value={depositForm.note}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Narration"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDepositModal}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  openConfirmModal(
                    'Post Bank Deposit?',
                    'Confirm posting this deposit to selected bank account.',
                    handleDepositBank
                  )
                }
                disabled={depositSaving}
                className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-sky-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {depositSaving ? 'Posting...' : 'Post Deposit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBankHistoryModal ? (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="relative w-full max-w-[96vw] overflow-hidden rounded-[28px] border border-cyan-100 bg-white shadow-[0_35px_140px_-50px_rgba(14,116,144,0.6)]">
            <div className="relative max-h-[92vh] overflow-y-auto">
              <div className="bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.35),_transparent_50%),linear-gradient(130deg,_rgba(8,47,73,0.95)_0%,_rgba(14,116,144,0.9)_48%,_rgba(2,132,199,0.88)_100%)]">
                <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                  <div>
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-xl">🏦</div>
                    <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bank Transaction History</h3>
                    <p className="mt-2 text-sm text-white/85 sm:text-base">
                      {selectedBankHistoryCompany?.name || 'Company'} • All bank-related journal movements
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeBankHistoryModal}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>
              </div>

              <div className="px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-800">
                  Found {bankHistoryRows.length} bank-related transactions.
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-[1100px] divide-y divide-slate-200">
                    <thead className="bg-slate-100/90">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit Account</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit Account</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Reference</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Narration</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {bankHistoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                            No bank transaction records found for this company.
                          </td>
                        </tr>
                      ) : (
                        bankHistoryRows.map((entry, idx) => (
                          <tr key={`${entry.id}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'}>
                            <td className="px-4 py-3 text-sm text-slate-700">{formatJournalDateTime(entry.posted_at, entry.date)}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.txMark}</td>
                            <td className="px-4 py-3 text-sm text-emerald-700">{entry.displayDebitAccount}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">{money(Number(entry.displayDebitAmount || 0))}</td>
                            <td className="px-4 py-3 text-sm text-rose-700">{entry.displayCreditAccount}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-rose-700">{money(Number(entry.displayCreditAmount || 0))}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.status || 'completed'}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.reference || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{entry.note || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={closeBankHistoryModal}
                    className="rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                  >
                    Close History
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {noticeModal.open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {noticeModal.tone === 'success' ? 'Success' : noticeModal.tone === 'error' ? 'Error' : 'Notice'}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{noticeModal.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{noticeModal.message}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setNoticeModal({ open: false, title: '', message: '', tone: 'info' })}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
